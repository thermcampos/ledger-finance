package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ledger.email.DailyDigest;
import com.ledger.entity.User;
import com.ledger.enums.AccountKind;
import com.ledger.service.DailyDigestService;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * DailyDigestService against real data (flag filter, yesterday's spend and its exclusions) and
 * POST /users/me/digest/test (400 / 200 with email disabled / 429).
 */
@QuarkusTest
class DailyDigestServiceTest {

  private static final String DIGEST_EMAIL = "digest-build@example.com";
  private static final String NONE_EMAIL = "digest-none@example.com";
  private static final String SEND_EMAIL = "digest-send@example.com";

  private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
  private static final LocalDate YESTERDAY = TODAY.minusDays(1);

  @Inject DailyDigestService digestService;

  @BeforeAll
  static void seed() {
    Long userId = LlmTestSupport.createUser(DIGEST_EMAIL);
    Long checking = LlmTestSupport.createAccount(userId, "Checking", AccountKind.CHECKING, "0.00");
    Long groceries = LlmTestSupport.createCategory(userId, "Groceries");
    Long dining = LlmTestSupport.createCategory(userId, "Dining");
    Long groceriesBudget = LlmTestSupport.createBudget(userId, groceries, "200.00");
    LlmTestSupport.markDailyEmailSummary(groceriesBudget);
    LlmTestSupport.createBudget(userId, dining, "200.00"); // not flagged

    LlmTestSupport.createTransaction(checking, groceries, "Market", "-20.00", YESTERDAY);
    LlmTestSupport.createTransaction(checking, groceries, "Market", "-30.00", TODAY);
    // A projection row yesterday is not spend.
    Long projection =
        LlmTestSupport.createTransaction(checking, groceries, "Projection", "-99.00", YESTERDAY);
    LlmTestSupport.markLinkedBudget(projection, groceriesBudget);
    LlmTestSupport.createTransaction(checking, dining, "Dinner", "-40.00", YESTERDAY);

    Long noneId = LlmTestSupport.createUser(NONE_EMAIL);
    LlmTestSupport.createBudget(noneId, LlmTestSupport.createCategory(noneId, "Groceries"), "10.00");

    // Master switch stays off: the test endpoint ignores it.
    Long sendId = LlmTestSupport.createUser(SEND_EMAIL);
    Long sendBudget =
        LlmTestSupport.createBudget(sendId, LlmTestSupport.createCategory(sendId, "Groceries"), "10.00");
    LlmTestSupport.markDailyEmailSummary(sendBudget);
  }

  private Optional<DailyDigest> buildFor(String email) {
    return QuarkusTransaction.requiringNew()
        .call(() -> digestService.buildFor(User.findByEmail(email)));
  }

  @Test
  void onlyFlaggedBudgetsWithYesterdaysSpend() {
    DailyDigest digest = buildFor(DIGEST_EMAIL).orElseThrow();

    assertEquals(TODAY, digest.today());
    assertEquals(1, digest.lines().size());
    DailyDigest.Line line = digest.lines().get(0);
    assertEquals("Groceries", line.categoryName());
    assertEquals("$20.00", line.yesterday(), "projection rows excluded");
    // On the 1st, yesterday belongs to last month: month totals are the new month's only.
    boolean sameMonth = YearMonth.from(YESTERDAY).equals(YearMonth.from(TODAY));
    assertEquals(sameMonth ? "$50.00" : "$30.00", line.spent());
    assertEquals(
        TODAY.getDayOfMonth() == 1 ? "Yesterday, " : "Yesterday",
        digest.yesterdayLabel().substring(0, TODAY.getDayOfMonth() == 1 ? 11 : 9));
  }

  @Test
  void nothingFlaggedBuildsNothing() {
    assertTrue(buildFor(NONE_EMAIL).isEmpty());
  }

  @Test
  void testEndpointRejectsWhenNothingIsFlagged() {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(NONE_EMAIL))
        .when()
        .post("/users/me/digest/test")
        .then()
        .statusCode(400)
        .body("message", is("No budgets selected for the summary"));
  }

  @Test
  void testEndpointSendsIgnoringMasterSwitchThenLimitsToOnePerMinute() {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(SEND_EMAIL))
        .when()
        .post("/users/me/digest/test")
        .then()
        .statusCode(200)
        .body("to", is(SEND_EMAIL))
        .body("delivered", is(false)); // ledger.email.enabled=false outside prod: logged only

    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(SEND_EMAIL))
        .when()
        .post("/users/me/digest/test")
        .then()
        .statusCode(429)
        .body("message", is("You can send one test email per minute — try again shortly"));
  }

  @Test
  void testEndpointRequiresAuth() {
    given().when().post("/users/me/digest/test").then().statusCode(401);
  }
}
