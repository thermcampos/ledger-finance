package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import io.quarkus.test.junit.QuarkusTest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Boundary tests: who is allowed where, plus expiry, revocation and rate limiting. */
@QuarkusTest
class LlmAuthTest {

  private static Long userId;
  private static String jwt;

  @BeforeAll
  static void seed() {
    userId = LlmTestSupport.createUser("llm-auth@example.com");
    jwt = LlmTestSupport.jwt("llm-auth@example.com");
  }

  @Test
  void validTokenAuthenticatesUnderLlm() {
    String token = LlmTestSupport.createApiToken(userId);
    given().auth().oauth2(token).when().get("/llm/accounts").then().statusCode(200);
  }

  @Test
  void tokenIsRejectedOutsideLlm() {
    // Outside /llm the API-token mechanism abstains and the JWT mechanism then fails on the
    // unparseable led_ token — so the rejection surfaces as 401.
    String token = LlmTestSupport.createApiToken(userId);
    given().auth().oauth2(token).when().get("/accounts").then().statusCode(401);
    given().auth().oauth2(token).when().get("/users/me").then().statusCode(401);
  }

  @Test
  void browserJwtIsRejectedInsideLlm() {
    given().auth().oauth2(jwt).when().get("/llm/accounts").then().statusCode(403);
  }

  @Test
  void expiredTokenIs401() {
    String token =
        LlmTestSupport.createApiToken(userId, Instant.now().minus(1, ChronoUnit.DAYS));
    given().auth().oauth2(token).when().get("/llm/accounts").then().statusCode(401);
  }

  @Test
  void revokedTokenIs401() {
    String token = LlmTestSupport.createApiToken(userId);
    Long tokenId = LlmTestSupport.findTokenId(token);

    given().auth().oauth2(jwt).when().delete("/users/me/tokens/" + tokenId).then().statusCode(204);

    given().auth().oauth2(token).when().get("/llm/accounts").then().statusCode(401);
  }

  @Test
  void unknownTokenIs401() {
    given()
        .auth()
        .oauth2("led_0000000000000000000000000000000000000000000000000000000000000000")
        .when()
        .get("/llm/accounts")
        .then()
        .statusCode(401);
  }

  @Test
  void noCredentialsIs401() {
    given().when().get("/llm/accounts").then().statusCode(401);
  }

  /** %test sets ledger.llm.rate-limit-per-minute=5, so the 6th call in a minute must 429. */
  @Test
  void rateLimitKicksIn() {
    String token = LlmTestSupport.createApiToken(userId);
    for (int i = 0; i < 5; i++) {
      given().auth().oauth2(token).when().get("/llm/categories").then().statusCode(200);
    }
    given().auth().oauth2(token).when().get("/llm/categories").then().statusCode(429);
  }
}
