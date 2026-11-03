package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ledger.email.EmailSendException;
import com.ledger.email.EmailService;
import com.ledger.entity.User;
import com.ledger.service.DailyDigestService;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;

/**
 * The scheduled run (DailyDigestService#sendAll) and its trigger, POST /internal/digests/daily.
 *
 * <p>The H2 database is shared with other test classes, so a run may touch their users too —
 * every assertion is about users created inside the test itself.
 */
@QuarkusTest
class DailyDigestScheduleTest {

  private static final String SECRET = "test-digest-secret"; // %test.ledger.digest.trigger-secret
  private static final String PATH = "/internal/digests/daily";
  private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Sao_Paulo"));

  @Inject DailyDigestService digestService;

  /** Records every send; throws for the given recipients (or everyone). */
  static class FakeEmail extends EmailService {
    final List<String> sent = new CopyOnWriteArrayList<>();
    final Set<String> failFor;
    final boolean failAll;

    FakeEmail(Set<String> failFor, boolean failAll) {
      super(null, null, true, Optional.of("unused"), "Ledger <test@example.test>");
      this.failFor = failFor;
      this.failAll = failAll;
    }

    @Override
    public Optional<String> send(
        String to, String subject, String html, String text, String idempotencyKey) {
      if (failAll || failFor.contains(to)) {
        throw new EmailSendException(503, "Resend 503: simulated outage");
      }
      sent.add(to + "|" + idempotencyKey);
      return Optional.of("re_fake");
    }

    boolean sentTo(String email) {
      return sent.stream().anyMatch(s -> s.startsWith(email + "|"));
    }
  }

  private static FakeEmail installFake(Set<String> failFor, boolean failAll) {
    FakeEmail fake = new FakeEmail(failFor, failAll);
    QuarkusMock.installMockForType(fake, EmailService.class);
    return fake;
  }

  /** A user with a budget; optionally flagged and/or with the master switch on. */
  private static Long user(String email, boolean summariesOn, boolean flagged) {
    Long id = LlmTestSupport.createUser(email);
    Long budget =
        LlmTestSupport.createBudget(id, LlmTestSupport.createCategory(id, "Groceries"), "100.00");
    if (flagged) {
      LlmTestSupport.markDailyEmailSummary(budget);
    }
    if (summariesOn) {
      LlmTestSupport.enableEmailSummaries(id);
    }
    return id;
  }

  private static LocalDate lastSentOn(Long userId) {
    return QuarkusTransaction.requiringNew()
        .call(() -> User.<User>findById(userId).lastDigestSentOn);
  }

  @Test
  void sendsOnlyToOptedInUsersAndSkipsWhenAlreadySentToday() {
    FakeEmail fake = installFake(Set.of(), false);
    Long on = user("sched-on@example.com", true, true);
    Long off = user("sched-off@example.com", false, true);
    Long noFlag = user("sched-noflag@example.com", true, false);

    digestService.sendAll();

    assertTrue(fake.sent.contains("sched-on@example.com|digest-" + on + "-" + TODAY), fake.sent.toString());
    assertEquals(TODAY, lastSentOn(on));
    assertFalse(fake.sentTo("sched-off@example.com"), "master switch off");
    assertFalse(fake.sentTo("sched-noflag@example.com"), "no flagged budget");
    assertNull(lastSentOn(off));
    assertNull(lastSentOn(noFlag));

    fake.sent.clear();
    digestService.sendAll();
    assertFalse(fake.sentTo("sched-on@example.com"), "second run the same day sends nothing");
  }

  @Test
  void failedSendIsNotMarkedAndDoesNotStopTheOthers() {
    // Created first → lower id → processed first, so "after" proves the loop continued.
    Long failing = user("sched-fail@example.com", true, true);
    Long after = user("sched-after@example.com", true, true);
    FakeEmail fake = installFake(Set.of("sched-fail@example.com"), false);

    DailyDigestService.RunResult result = digestService.sendAll();

    assertTrue(result.failed() >= 1, result.toString());
    assertNull(lastSentOn(failing), "mark sent only on success");
    assertTrue(fake.sentTo("sched-after@example.com"));
    assertEquals(TODAY, lastSentOn(after));

    // The next run (e.g. the CronJob's retry) picks the failed user up again.
    FakeEmail healthy = installFake(Set.of(), false);
    digestService.sendAll();
    assertTrue(healthy.sentTo("sched-fail@example.com"));
    assertFalse(healthy.sentTo("sched-after@example.com"));
    assertEquals(TODAY, lastSentOn(failing));
  }

  @Test
  void endpointRunsWithTheRightSecret() {
    user("sched-endpoint@example.com", true, true);
    FakeEmail fake = installFake(Set.of(), false);

    given()
        .header("X-Digest-Secret", SECRET)
        .when()
        .post(PATH)
        .then()
        .statusCode(200)
        .body("sent", greaterThanOrEqualTo(1))
        .body("skipped", notNullValue())
        .body("failed", is(0));
    assertTrue(fake.sentTo("sched-endpoint@example.com"));
  }

  @Test
  void endpointReturns500WhenEverySendFails() {
    user("sched-allfail@example.com", true, true);
    FakeEmail fake = installFake(Set.of(), true);

    given()
        .header("X-Digest-Secret", SECRET)
        .when()
        .post(PATH)
        .then()
        .statusCode(500)
        .body("sent", is(0))
        .body("failed", greaterThanOrEqualTo(1));
    assertTrue(fake.sent.isEmpty());
    assertNull(
        lastSentOn(
            QuarkusTransaction.requiringNew()
                .call(() -> User.findByEmail("sched-allfail@example.com").id)));
  }

  @Test
  void endpointRejectsAMissingSecret() {
    given().when().post(PATH).then().statusCode(403);
  }

  @Test
  void endpointRejectsAWrongSecret() {
    given().header("X-Digest-Secret", SECRET + "x").when().post(PATH).then().statusCode(403);
    given().header("X-Digest-Secret", "").when().post(PATH).then().statusCode(403);
  }

  @Test
  void endpointIsInvisibleThroughTheIngress() {
    given()
        .header("X-Digest-Secret", SECRET)
        .header("X-Forwarded-For", "203.0.113.7")
        .when()
        .post(PATH)
        .then()
        .statusCode(404);
  }

  @Test
  void aUserJwtIsNoSubstituteForTheSecret() {
    LlmTestSupport.createUser("sched-jwt@example.com");
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt("sched-jwt@example.com"))
        .when()
        .post(PATH)
        .then()
        .statusCode(403);
  }
}
