package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import com.ledger.enums.AccountKind;
import io.quarkus.test.junit.QuarkusTest;
import java.time.LocalDate;
import java.time.YearMonth;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Happy-path coverage of the /llm endpoints, including projection-row exclusion. */
@QuarkusTest
class LlmEndpointsTest {

  private static Long userId;
  private static Long checkingId;
  private static Long cardId;
  private static Long groceriesId;
  private static Long fuelId;
  private static Long budgetId;
  private static Long projectionTxId;
  private static Long billRowTxId;

  @BeforeAll
  static void seed() {
    userId = LlmTestSupport.createUser("llm-data@example.com");
    checkingId =
        LlmTestSupport.createAccount(userId, "Checking", AccountKind.CHECKING, "1000.00");
    cardId = LlmTestSupport.createAccount(userId, "Nubank", AccountKind.CREDIT_CARD, "0.00");
    LlmTestSupport.setDueDay(cardId, 15);
    groceriesId = LlmTestSupport.createCategory(userId, "Groceries");
    fuelId = LlmTestSupport.createCategory(userId, "Gasoline");
    budgetId = LlmTestSupport.createBudget(userId, groceriesId, "500.00");

    LocalDate thisMonth = LocalDate.now().withDayOfMonth(1);
    LlmTestSupport.createTransaction(checkingId, null, "Salary", "3000.00", thisMonth);
    LlmTestSupport.createTransaction(checkingId, groceriesId, "Market", "-200.00", thisMonth);
    LlmTestSupport.createTransaction(cardId, fuelId, "Fuel", "-150.00", thisMonth);
    // An older month, so cashflow/by-month has two months of data.
    LlmTestSupport.createTransaction(
        checkingId, null, "Salary", "3000.00", LocalDate.now().minusMonths(1).withDayOfMonth(1));

    // System-generated projection rows — must never leak into /llm responses.
    projectionTxId =
        LlmTestSupport.createTransaction(
            checkingId, groceriesId, "Budget projection", "-300.00",
            YearMonth.now().atEndOfMonth());
    LlmTestSupport.markLinkedBudget(projectionTxId, budgetId);
    billRowTxId =
        LlmTestSupport.createTransaction(
            checkingId, null, "Credit card bill — Nubank", "-150.00",
            LocalDate.now().plusDays(10));
    LlmTestSupport.markLinkedCard(billRowTxId, cardId);
  }

  private String freshToken() {
    return LlmTestSupport.createApiToken(userId);
  }

  @Test
  void summaryAggregatesAndExcludesProjections() {
    String token = freshToken();
    String month = YearMonth.now().toString();
    given()
        .auth()
        .oauth2(token)
        .when()
        .get("/llm/summary?month=" + month)
        .then()
        .statusCode(200)
        .body("month", is(month))
        .body("income", is(3000.0f))
        .body("expenses", is(350.0f))
        .body("net", is(2650.0f))
        .body("accounts.size()", is(2))
        // one open bill on the card: the fuel charge
        .body("cardBills.size()", is(1))
        .body("cardBills[0].card", is("Nubank"))
        .body("cardBills[0].total", is(150.0f))
        .body("cardBills[0].dueOn", notNullValue());
  }

  @Test
  void transactionsExcludeProjectionRows() {
    String token = freshToken();
    given()
        .auth()
        .oauth2(token)
        .when()
        .get("/llm/transactions")
        .then()
        .statusCode(200)
        .body("truncated", is(false))
        .body("transactions.id", not(hasItems(projectionTxId.intValue(), billRowTxId.intValue())))
        .body("transactions.description", hasItem("Market"));
  }

  @Test
  void transactionsSupportQueryAndLimit() {
    String token = freshToken();
    String from = LocalDate.now().minusMonths(1).withDayOfMonth(1).toString();
    String to = LocalDate.now().toString();
    given()
        .auth()
        .oauth2(token)
        .when()
        .get("/llm/transactions?from=" + from + "&to=" + to + "&q=salary&limit=1")
        .then()
        .statusCode(200)
        .body("transactions.size()", is(1))
        .body("truncated", is(true))
        .body("transactions[0].description", is("Salary"));
  }

  @Test
  void budgetsReportLiveSpendAndStatus() {
    String token = freshToken();
    given()
        .auth()
        .oauth2(token)
        .when()
        .get("/llm/budgets")
        .then()
        .statusCode(200)
        .body("size()", is(1))
        .body("[0].category", is("Groceries"))
        .body("[0].limit", is(500.0f))
        .body("[0].spent", is(200.0f))
        .body("[0].remaining", is(300.0f))
        .body("[0].status", is("On track"));
  }

  @Test
  void cashflowCoversRequestedMonths() {
    String token = freshToken();
    given()
        .auth()
        .oauth2(token)
        .when()
        .get("/llm/cashflow/by-month?months=2")
        .then()
        .statusCode(200)
        .body("size()", is(2))
        .body("[0].month", is(YearMonth.now().minusMonths(1).toString()))
        .body("[0].income", is(3000.0f))
        .body("[1].month", is(YearMonth.now().toString()))
        .body("[1].income", is(3000.0f))
        .body("[1].expenses", is(350.0f));
  }

  @Test
  void spendingByCategoryTotalsExpenses() {
    String token = freshToken();
    given()
        .auth()
        .oauth2(token)
        .when()
        .get("/llm/spending/by-category")
        .then()
        .statusCode(200)
        .body("size()", is(2))
        .body("find { it.category == 'Groceries' }.total", is(200.0f))
        .body("find { it.category == 'Gasoline' }.total", is(150.0f));
  }

  @Test
  void referenceData() {
    String token = freshToken();
    given()
        .auth()
        .oauth2(token)
        .when()
        .get("/llm/accounts")
        .then()
        .statusCode(200)
        .body("size()", is(2))
        .body("find { it.name == 'Checking' }.balance", is(1000.0f));

    given()
        .auth()
        .oauth2(token)
        .when()
        .get("/llm/categories")
        .then()
        .statusCode(200)
        .body("name", hasItems("Groceries", "Gasoline"));
  }
}
