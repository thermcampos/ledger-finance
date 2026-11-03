package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import com.ledger.enums.AccountKind;
import io.quarkus.test.junit.QuarkusTest;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * A transaction sitting in an already-paid credit card bill: only the amount (or a move into/out
 * of the paid bill) is rejected — category, description and flags stay editable.
 */
@QuarkusTest
class PaidBillEditTest {

  private static final String EMAIL = "paid-bill-edit@example.com";

  private static Long userId;
  private static Long cardId;
  private static Long groceriesId;
  private static Long fuelId;
  private static Long paidBillTxnId;
  private static Long openBillTxnId;

  @BeforeAll
  static void seed() {
    userId = LlmTestSupport.createUser(EMAIL);
    cardId = LlmTestSupport.createAccount(userId, "Nubank", AccountKind.CREDIT_CARD, "0.00");
    LlmTestSupport.setDueDay(cardId, 15);
    groceriesId = LlmTestSupport.createCategory(userId, "Groceries");
    fuelId = LlmTestSupport.createCategory(userId, "Fuel");

    // dueDay 15, occurredOn 2026-01-20 → bill due 2026-02-15, marked paid below.
    paidBillTxnId =
        LlmTestSupport.createTransaction(
            cardId, groceriesId, "Market", "-150.00", LocalDate.of(2026, 1, 20));
    LlmTestSupport.markBillPaid(cardId, LocalDate.of(2026, 2, 15));

    // due 2026-03-15 — still open.
    openBillTxnId =
        LlmTestSupport.createTransaction(
            cardId, groceriesId, "Pharmacy", "-40.00", LocalDate.of(2026, 3, 2));
  }

  private String jwt() {
    return LlmTestSupport.jwt(EMAIL);
  }

  private static String updateBody(Long categoryId, String description, String amount, String occurredOn) {
    return """
        {
          "categoryId": %d,
          "description": "%s",
          "amount": %s,
          "occurredOn": "%s",
          "completed": false,
          "debitAuthorized": false
        }
        """
        .formatted(categoryId, description, amount, occurredOn);
  }

  @Test
  void categoryChangeOnPaidBillIsAllowed() {
    // Mirrors the frontend payload: amount as a plain JSON number (scale 0 vs the stored 150.00)
    // and no billDueDate field — neither must count as a bill change.
    given()
        .auth()
        .oauth2(jwt())
        .contentType("application/json")
        .body(updateBody(fuelId, "Market", "-150", "2026-01-20"))
        .when()
        .put("/transactions/" + paidBillTxnId)
        .then()
        .statusCode(200)
        .body("category.id", is(fuelId.intValue()))
        .body("amount", is(-150));
  }

  @Test
  void amountChangeOnPaidBillIsRejected() {
    given()
        .auth()
        .oauth2(jwt())
        .contentType("application/json")
        .body(updateBody(groceriesId, "Market", "-200", "2026-01-20"))
        .when()
        .put("/transactions/" + paidBillTxnId)
        .then()
        .statusCode(400);
  }

  @Test
  void dateMoveOutOfPaidBillIsRejected() {
    given()
        .auth()
        .oauth2(jwt())
        .contentType("application/json")
        .body(updateBody(groceriesId, "Market", "-150", "2026-03-02"))
        .when()
        .put("/transactions/" + paidBillTxnId)
        .then()
        .statusCode(400);
  }

  @Test
  void dateMoveIntoPaidBillIsRejected() {
    given()
        .auth()
        .oauth2(jwt())
        .contentType("application/json")
        .body(updateBody(groceriesId, "Pharmacy", "-40", "2026-01-20"))
        .when()
        .put("/transactions/" + openBillTxnId)
        .then()
        .statusCode(400);
  }

  @Test
  void amountChangeOnOpenBillIsAllowed() {
    given()
        .auth()
        .oauth2(jwt())
        .contentType("application/json")
        .body(updateBody(groceriesId, "Pharmacy", "-45.50", "2026-03-02"))
        .when()
        .put("/transactions/" + openBillTxnId)
        .then()
        .statusCode(200)
        .body("amount", is(-45.5f));
  }
}
