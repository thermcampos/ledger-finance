package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import com.ledger.enums.AccountKind;
import io.quarkus.test.junit.QuarkusTest;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Per-category spend feeding Budgets and the Report page: future rows only with includeUpcoming,
 * and internal categories ("Card payment") never — they mirror spend already counted on the card.
 */
@QuarkusTest
class SpendForMonthTest {

  private static final String EMAIL = "spend-for-month@example.com";

  private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
  private static final YearMonth MONTH = YearMonth.from(TODAY);

  private static Long groceriesId;
  private static Long cardPaymentId;

  @BeforeAll
  static void seed() {
    Long userId = LlmTestSupport.createUser(EMAIL);
    Long checkingId =
        LlmTestSupport.createAccount(userId, "Checking", AccountKind.CHECKING, "1000.00");
    groceriesId = LlmTestSupport.createCategory(userId, "Groceries");
    cardPaymentId = LlmTestSupport.createCategory(userId, "Card payment");
    LlmTestSupport.markInternal(cardPaymentId);

    LlmTestSupport.createTransaction(checkingId, groceriesId, "Market", "-50.00", TODAY);
    LlmTestSupport.createTransaction(checkingId, cardPaymentId, "Bill", "-300.00", TODAY);
    if (!TODAY.equals(MONTH.atEndOfMonth())) {
      LlmTestSupport.createTransaction(
          checkingId, groceriesId, "Market later", "-20.00", MONTH.atEndOfMonth());
    }
  }

  private String jwt() {
    return LlmTestSupport.jwt(EMAIL);
  }

  @Test
  void excludesInternalCategories() {
    given()
        .auth()
        .oauth2(jwt())
        .queryParam("includeUpcoming", true)
        .when()
        .get("/budgets/month/" + MONTH + "/spend")
        .then()
        .statusCode(200)
        .body("categoryId", not(hasItem(cardPaymentId.intValue())));
  }

  @Test
  void upcomingRowsOnlyWhenRequested() {
    Assumptions.assumeFalse(TODAY.equals(MONTH.atEndOfMonth()), "no future day left this month");

    given()
        .auth()
        .oauth2(jwt())
        .when()
        .get("/budgets/month/" + MONTH + "/spend")
        .then()
        .statusCode(200)
        .body("find { it.categoryId == " + groceriesId + " }.spent", is(50.0f));

    given()
        .auth()
        .oauth2(jwt())
        .queryParam("includeUpcoming", true)
        .when()
        .get("/budgets/month/" + MONTH + "/spend")
        .then()
        .statusCode(200)
        .body("find { it.categoryId == " + groceriesId + " }.spent", is(70.0f));
  }
}
