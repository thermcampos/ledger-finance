package com.ledger.service;

import com.ledger.dto.response.CategorySpendResponse;
import com.ledger.email.DailyDigest;
import com.ledger.email.EmailSendException;
import com.ledger.email.EmailService;
import com.ledger.entity.Budget;
import com.ledger.entity.User;
import io.quarkus.qute.Location;
import io.quarkus.qute.Template;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * The daily budget digest (docs/daily-digest.md): built from the same month summary the Budgets
 * page shows, for the budgets flagged "Daily email summary", plus yesterday's spend.
 */
@ApplicationScoped
public class DailyDigestService {

  /** Minimum gap between two test emails for one user. */
  static final Duration TEST_INTERVAL = Duration.ofMinutes(1);

  @Inject BudgetSpendService spendService;

  @Inject BudgetClock clock;

  @Inject EmailService emailService;

  @Location("email/daily-digest.html")
  Template htmlTemplate;

  @Location("email/daily-digest.txt")
  Template textTemplate;

  @ConfigProperty(name = "ledger.app.url")
  String appUrl;

  Clock wallClock = Clock.systemUTC();

  private final Map<Long, Instant> lastTestSend = new ConcurrentHashMap<>();

  public record RenderedEmail(String subject, String html, String text) {}

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
    return buildFor(user, false);
  }

  Optional<DailyDigest> buildFor(User user, boolean test) {
    LocalDate today = clock.today();
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
    DailyDigest digest = buildFor(user, true).orElseThrow(NothingToSendException::new);

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

  private String profileUrl() {
    return appUrl.replaceAll("/+$", "") + "/profile";
  }
}
