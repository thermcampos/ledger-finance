package com.ledger.service;

import com.ledger.dto.response.CategorySpendResponse;
import com.ledger.email.DailyDigest;
import com.ledger.email.EmailSendException;
import com.ledger.email.EmailService;
import com.ledger.entity.Budget;
import com.ledger.entity.User;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.qute.Location;
import io.quarkus.qute.Template;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * The daily budget digest (docs/daily-digest.md): built from the same month summary the Budgets
 * page shows, for the budgets flagged "Daily email summary", plus yesterday's spend.
 *
 * <p>Sent on a schedule by {@link #sendAll()} — triggered by a k3s CronJob through {@code POST
 * /internal/digests/daily} (docs/adr/0001-scheduled-jobs-via-cronjob.md) — and on demand by
 * {@link #sendTest(User)}.
 */
@ApplicationScoped
public class DailyDigestService {

  private static final Logger LOG = Logger.getLogger(DailyDigestService.class);

  /** Minimum gap between two test emails for one user. */
  static final Duration TEST_INTERVAL = Duration.ofMinutes(1);

  @Inject BudgetSpendService spendService;

  @Inject BudgetClock clock;

  @Inject EmailService emailService;

  @Inject BudgetProjectionSyncService budgetSync;

  @Inject EntityManager em;

  @Location("email/daily-digest.html")
  Template htmlTemplate;

  @Location("email/daily-digest.txt")
  Template textTemplate;

  @ConfigProperty(name = "ledger.app.url")
  String appUrl;

  Clock wallClock = Clock.systemUTC();

  private final Map<Long, Instant> lastTestSend = new ConcurrentHashMap<>();

  public record RenderedEmail(String subject, String html, String text) {}

  /** Outcome of one scheduled run; the internal endpoint returns it as JSON. */
  public record RunResult(int sent, int skipped, int failed) {}

  private enum Outcome {
    SENT,
    SKIPPED
  }

  /** No budgets flagged — nothing to send. */
  public static class NothingToSendException extends RuntimeException {
    public NothingToSendException() {
      super("No budgets selected for the summary");
    }
  }

  /** A test email was already sent within {@link #TEST_INTERVAL}. */
  public static class TooSoonException extends RuntimeException {
    public TooSoonException() {
      super("You can send one test email per minute — try again shortly");
    }
  }

  /** The scheduled digest for today, or empty when no budget is flagged. */
  public Optional<DailyDigest> buildFor(User user) {
    return buildFor(user, false, clock.today());
  }

  Optional<DailyDigest> buildFor(User user, boolean test, LocalDate today) {
    Set<Long> flagged =
        Budget.<Budget>list("user.id = ?1 and dailyEmailSummary = true", user.id).stream()
            .map(b -> b.id)
            .collect(Collectors.toSet());
    if (flagged.isEmpty()) {
      return Optional.empty();
    }
    LocalDate yesterday = today.minusDays(1);
    Map<Long, BigDecimal> yesterdaySpent =
        spendService.spendBetween(user, yesterday, yesterday).stream()
            .collect(
                Collectors.toMap(CategorySpendResponse::categoryId, CategorySpendResponse::spent));
    return DailyDigest.of(
        spendService.summaryForMonth(user, YearMonth.from(today)),
        flagged,
        yesterdaySpent,
        test,
        profileUrl());
  }

  public RenderedEmail render(DailyDigest digest) {
    return new RenderedEmail(
        digest.subject(),
        htmlTemplate.data("digest", digest).render(),
        textTemplate.data("digest", digest).render());
  }

  /**
   * Builds and sends today's digest to the user now, regardless of the "Email summaries" master
   * switch. One per user per minute; the idempotency key is per minute too.
   *
   * @return Resend's message id, or empty when email is disabled (the text body is logged)
   * @throws NothingToSendException no budget is flagged
   * @throws TooSoonException a test was sent less than a minute ago
   * @throws EmailSendException Resend rejected or couldn't be reached
   */
  public Optional<String> sendTest(User user) {
    DailyDigest digest =
        buildFor(user, true, clock.today()).orElseThrow(NothingToSendException::new);

    Instant now = wallClock.instant();
    boolean[] allowed = {false};
    lastTestSend.compute(
        user.id,
        (id, last) -> {
          if (last != null && Duration.between(last, now).compareTo(TEST_INTERVAL) < 0) {
            return last;
          }
          allowed[0] = true;
          return now;
        });
    if (!allowed[0]) {
      throw new TooSoonException();
    }

    RenderedEmail email = render(digest);
    String key = "digest-test-" + user.id + "-" + now.getEpochSecond() / 60;
    return emailService.send(user.email, email.subject(), email.html(), email.text(), key);
  }

  /**
   * The scheduled run: one digest per opted-in user per day.
   *
   * <p>Users with "Email summaries" on and at least one flagged budget are processed one at a
   * time, each in its own transaction. Already sent today → skipped. Otherwise the budget
   * projections are synced (month rollover even if the app wasn't opened), the digest is sent with
   * the idempotency key {@code digest-{userId}-{yyyy-MM-dd}}, and only then is {@code
   * lastDigestSentOn} set. A failure rolls that user back, is logged, and doesn't stop the others.
   * Safe to call again the same day.
   */
  public RunResult sendAll() {
    LocalDate today = clock.today(); // once per run, so a run crossing midnight stays one "day"
    List<Long> userIds =
        QuarkusTransaction.requiringNew()
            .call(
                () ->
                    em.createQuery(
                            "SELECT DISTINCT b.user.id FROM Budget b "
                                + "WHERE b.dailyEmailSummary = true "
                                + "AND b.user.emailSummariesEnabled = true "
                                + "ORDER BY b.user.id",
                            Long.class)
                        .getResultList());

    int sent = 0;
    int skipped = 0;
    int failed = 0;
    for (Long userId : userIds) {
      try {
        Outcome outcome =
            QuarkusTransaction.requiringNew().call(() -> sendDaily(userId, today));
        if (outcome == Outcome.SENT) {
          sent++;
        } else {
          skipped++;
        }
      } catch (RuntimeException e) {
        failed++;
        LOG.errorf(e, "Daily digest for user %d on %s failed: %s", userId, today, e.getMessage());
      }
    }
    LOG.infof(
        "Daily digest %s: %d sent, %d skipped, %d failed", today, sent, skipped, failed);
    return new RunResult(sent, skipped, failed);
  }

  /** One user, inside the caller's transaction — any exception rolls the whole user back. */
  private Outcome sendDaily(Long userId, LocalDate today) {
    User user = User.findById(userId);
    if (user == null || !user.emailSummariesEnabled || today.equals(user.lastDigestSentOn)) {
      return Outcome.SKIPPED;
    }
    budgetSync.syncAll(user);
    Optional<DailyDigest> digest = buildFor(user, false, today);
    if (digest.isEmpty()) {
      return Outcome.SKIPPED;
    }
    RenderedEmail email = render(digest.get());
    emailService.send(
        user.email, email.subject(), email.html(), email.text(), "digest-" + userId + "-" + today);
    user.lastDigestSentOn = today; // only reached after Resend's 2xx (send throws otherwise)
    return Outcome.SENT;
  }

  private String profileUrl() {
    return appUrl.replaceAll("/+$", "") + "/profile";
  }
}
