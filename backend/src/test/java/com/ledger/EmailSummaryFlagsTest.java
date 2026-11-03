package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Daily digest opt-ins round-trip: Budget.dailyEmailSummary and User.emailSummariesEnabled. */
@QuarkusTest
class EmailSummaryFlagsTest {

  private static final String BUDGET_EMAIL = "flags-budget@example.com";
  private static final String PROFILE_EMAIL = "flags-profile@example.com";

  private static Long categoryId;

  @BeforeAll
  static void seed() {
    Long userId = LlmTestSupport.createUser(BUDGET_EMAIL);
    categoryId = LlmTestSupport.createCategory(userId, "Groceries");
    LlmTestSupport.createUser(PROFILE_EMAIL);
  }

  private static void upsertBudget(Boolean dailyEmailSummary) {
    Map<String, Object> body = new HashMap<>();
    body.put("categoryId", categoryId);
    body.put("limitAmount", 500);
    if (dailyEmailSummary != null) {
      body.put("dailyEmailSummary", dailyEmailSummary);
    }
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(BUDGET_EMAIL))
        .contentType(ContentType.JSON)
        .body(body)
        .when()
        .post("/budgets")
        .then()
        .statusCode(200)
        .body("dailyEmailSummary", is(Boolean.TRUE.equals(dailyEmailSummary)));
  }

  private static void assertListedFlag(boolean expected) {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(BUDGET_EMAIL))
        .when()
        .get("/budgets")
        .then()
        .statusCode(200)
        .body("find { it.category.id == " + categoryId + " }.dailyEmailSummary", is(expected));
  }

  @Test
  void budgetFlagRoundTripsAndNullMeansFalse() {
    upsertBudget(true);
    assertListedFlag(true);
    upsertBudget(null);
    assertListedFlag(false);
    upsertBudget(true);
    upsertBudget(false);
    assertListedFlag(false);
  }

  private static void putProfile(Boolean enabled) {
    Map<String, Object> body = new HashMap<>();
    body.put("email", PROFILE_EMAIL);
    body.put("displayName", "Test User");
    if (enabled != null) {
      body.put("emailSummariesEnabled", enabled);
    }
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(PROFILE_EMAIL))
        .contentType(ContentType.JSON)
        .body(body)
        .when()
        .put("/users/me")
        .then()
        .statusCode(200);
  }

  private static void assertProfileFlag(boolean expected) {
    given()
        .auth()
        .oauth2(LlmTestSupport.jwt(PROFILE_EMAIL))
        .when()
        .get("/users/me")
        .then()
        .statusCode(200)
        .body("emailSummariesEnabled", is(expected));
  }

  @Test
  void profileSwitchDefaultsOffRoundTripsAndNullLeavesItUnchanged() {
    assertProfileFlag(false);
    putProfile(true);
    assertProfileFlag(true);
    putProfile(null);
    assertProfileFlag(true);
    putProfile(false);
    assertProfileFlag(false);
  }
}
