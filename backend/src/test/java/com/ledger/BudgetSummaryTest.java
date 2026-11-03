package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import com.ledger.enums.AccountKind;
import io.quarkus.test.junit.QuarkusTest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * GET /budgets/month/{yyyy-MM}/summary — the figures the Budgets page shows: spend exclusions
 * (projections, internal categories, future rows), signed refunds, status, days left (today
 * included) and per-day remaining.
 */
@QuarkusTest
class BudgetSummaryTest {

  private static final String EMAIL = "budget-summary@example.com";

  private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
  private static final YearMonth MONTH = YearMonth.from(TODAY);
  private static final int DAYS_LEFT =
      (int) ChronoUnit.DAYS.between(TODAY, MONTH.atEndOfMonth()) + 1;

  private static Long groceriesId;
  private static Long diningId;
  private static Long travelId;

  @BeforeAll
  static void seed() {
    Long userId = LlmTestSupport.createUser(EMAIL);
    Long checkingId =
        LlmTestSupport.createAccount(userId, "Checking", AccountKind.CHECKING, "1000.00");
    groceriesId = LlmTestSupport.createCategory(userId, "Groceries");
    diningId = LlmTestSupport.createCategory(userId, "Dining");
    travelId = LlmTestSupport.createCategory(userId, "Travel");
    Long cardPaymentId = LlmTestSupport.createCategory(userId, "Card payment");
    LlmTestSupport.markInternal(cardPaymentId);

    Long groceriesBudget = LlmTestSupport.createBudget(userId, groceriesId, "100.00");
    LlmTestSupport.createBudget(userId, diningId, "100.00");
    LlmTestSupport.createBudget(userId, travelId, "50.00");
    LlmTestSupport.createBudget(userId, cardPaymentId, "10.00");

    // Groceries: 50 spent, 5 refunded → 45 spent.
    LlmTestSupport.createTransaction(checkingId, groceriesId, "Market", "-50.00", TODAY);
    LlmTestSupport.createTransaction(checkingId, groceriesId, "Refund", "5.00", TODAY);
    // A projection row in the category must not count as spend.
    Long projection =
        LlmTestSupport.createTransaction(
            checkingId, groceriesId, "Budget projection", "-30.00", TODAY);
    LlmTestSupport.markLinkedBudget(projection, groceriesBudget);
    // Rows after today are excluded (only possible when today isn't the last day).
    if (!TODAY.equals(MONTH.atEndOfMonth())) {
      LlmTestSupport.createTransaction(
          checkingId, groceriesId, "Market later", "-40.00", MONTH.atEndOfMonth());
    }
    // Last month's rows are excluded.
    LlmTestSupport.createTransaction(
        checkingId, groceriesId, "Old market", "-70.00", MONTH.minusMonths(1).atDay(1));

    LlmTestSupport.createTransaction(checkingId, diningId, "Dinner", "-90.00", TODAY);
    LlmTestSupport.createTransaction(checkingId, travelId, "Bus", "-60.00", TODAY);
    LlmTestSupport.createTransaction(checkingId, cardPaymentId, "Bill", "-300.00", TODAY);
  }

  private String path() {
    return "/budgets/month/" + MONTH + "/summary";
  }

  private static String budget(Long categoryId, String field) {
    return "budgets.find { it.categoryId == " + categoryId + " }." + field;
  }

  @Test
  void monthHeader() {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(EMAIL))
        .when()
        .get(path())
        .then()
        .statusCode(200)
        .body("yearMonth", is(MONTH.toString()))
        .body("today", is(TODAY.toString()))
        .body("daysLeft", is(DAYS_LEFT))
        .body("daysLeft", greaterThanOrEqualTo(1));
  }

  @Test
  void spendExclusionsAndRefunds() {
    float perDay =
        new BigDecimal("55.00")
            .divide(BigDecimal.valueOf(DAYS_LEFT), 2, RoundingMode.HALF_UP)
            .floatValue();
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(EMAIL))
        .when()
        .get(path())
        .then()
        .statusCode(200)
        .body(budget(groceriesId, "spent"), is(45.0f))
        .body(budget(groceriesId, "limit"), is(100.0f))
        .body(budget(groceriesId, "left"), is(55.0f))
        .body(budget(groceriesId, "status"), is("ON_TRACK"))
        .body(budget(groceriesId, "perDay"), is(perDay));
  }

  @Test
  void internalCategoryBudgetShowsNoSpend() {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(EMAIL))
        .when()
        .get(path())
        .then()
        .statusCode(200)
        .body("budgets.find { it.categoryName == 'Card payment' }.spent", is(0))
        .body("budgets.find { it.categoryName == 'Card payment' }.status", is("ON_TRACK"));
  }

  @Test
  void statusesAndOverBudgetHasNoPerDay() {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(EMAIL))
        .when()
        .get(path())
        .then()
        .statusCode(200)
        .body(budget(diningId, "status"), is("NEAR_LIMIT"))
        .body(budget(travelId, "status"), is("OVER_BUDGET"))
        .body(budget(travelId, "left"), is(-10.0f))
        .body(budget(travelId, "perDay"), nullValue());
  }

  @Test
  void sortedByCategoryName() {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(EMAIL))
        .when()
        .get(path())
        .then()
        .statusCode(200)
        .body("budgets.categoryName", contains("Card payment", "Dining", "Groceries", "Travel"));
  }

  @Test
  void badMonthIs400() {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(EMAIL))
        .when()
        .get("/budgets/month/2026-13/summary")
        .then()
        .statusCode(400);
  }
}
