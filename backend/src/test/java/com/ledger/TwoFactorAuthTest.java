package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.ledger.entity.PendingLogin;
import com.ledger.entity.User;
import com.ledger.security.SecretEncryptionService;
import com.ledger.security.TotpService;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

/**
 * The full 2FA lifecycle over HTTP (ADR-0003): enroll → enable → challenged login → TOTP and
 * recovery-code verification, attempt budget, disable. One ordered class because the steps build
 * on each other; the user is unique to this class.
 */
@QuarkusTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class TwoFactorAuthTest {

  private static final String EMAIL = "two-factor@example.com";
  private static final String PASSWORD = "password12345";

  @Inject TotpService totpService;

  @Inject SecretEncryptionService encryption;

  private static String jwt;
  private static List<String> recoveryCodes;

  @BeforeAll
  static void seed() {
    LlmTestSupport.createUser(EMAIL);
    jwt = LlmTestSupport.jwt(EMAIL);
  }

  /** The current valid TOTP for the user's enrolled secret, decrypted the way the service does. */
  private String currentTotp() {
    String encrypted =
        QuarkusTransaction.requiringNew().call(() -> User.findByEmail(EMAIL).totpSecret);
    assertNotNull(encrypted);
    String secret = encryption.decrypt(encrypted);
    return totpService.codeAt(secret, Instant.now().getEpochSecond() / 30);
  }

  private static Response login() {
    return given()
        .contentType(ContentType.JSON)
        .body("{\"email\": \"" + EMAIL + "\", \"password\": \"" + PASSWORD + "\"}")
        .when()
        .post("/auth/login");
  }

  private static Response verify(String pendingToken, String code, String codeType) {
    return given()
        .contentType(ContentType.JSON)
        .body(
            "{\"pendingToken\": \""
                + pendingToken
                + "\", \"code\": \""
                + code
                + "\", \"codeType\": \""
                + codeType
                + "\"}")
        .when()
        .post("/auth/login/2fa");
  }

  @Test
  @Order(1)
  void loginWithout2faStaysOneStep() {
    login()
        .then()
        .statusCode(200)
        .body("status", is("AUTHENTICATED"))
        .body("token", notNullValue())
        .body("email", is(EMAIL))
        .body("pendingToken", nullValue());
  }

  @Test
  @Order(2)
  void setupReturnsUriAndManualKeyButStaysInert() {
    given()
        .auth()
        .oauth2(jwt)
        .when()
        .post("/users/me/2fa/setup")
        .then()
        .statusCode(200)
        .body("otpauthUri", org.hamcrest.Matchers.startsWith("otpauth://totp/Ledger%3A"))
        .body("manualKey", notNullValue());

    given()
        .auth()
        .oauth2(jwt)
        .when()
        .get("/users/me")
        .then()
        .statusCode(200)
        .body("totpEnabled", is(false));

    // A started-but-unconfirmed enrollment must not challenge logins.
    login().then().statusCode(200).body("status", is("AUTHENTICATED"));
  }

  @Test
  @Order(3)
  void enableRejectsWrongCode() {
    given()
        .auth()
        .oauth2(jwt)
        .contentType(ContentType.JSON)
        .body("{\"code\": \"000000\"}")
        .when()
        .post("/users/me/2fa/enable")
        .then()
        .statusCode(400);
  }

  @Test
  @Order(4)
  void enableWithValidCodeReturnsRecoveryCodes() {
    recoveryCodes =
        given()
            .auth()
            .oauth2(jwt)
            .contentType(ContentType.JSON)
            .body("{\"code\": \"" + currentTotp() + "\"}")
            .when()
            .post("/users/me/2fa/enable")
            .then()
            .statusCode(200)
            .body("$", hasSize(8))
            .extract()
            .jsonPath()
            .getList(".");

    given()
        .auth()
        .oauth2(jwt)
        .when()
        .get("/users/me")
        .then()
        .statusCode(200)
        .body("totpEnabled", is(true));
  }

  @Test
  @Order(5)
  void loginChallengesAndTotpCompletes() {
    String pendingToken =
        login()
            .then()
            .statusCode(200)
            .body("status", is("TWO_FACTOR_REQUIRED"))
            .body("token", nullValue())
            .body("pendingToken", notNullValue())
            .extract()
            .path("pendingToken");

    verify(pendingToken, "000000", "TOTP").then().statusCode(401);

    verify(pendingToken, currentTotp(), "TOTP")
        .then()
        .statusCode(200)
        .body("token", notNullValue())
        .body("email", is(EMAIL));

    // The challenge is single-use.
    verify(pendingToken, currentTotp(), "TOTP").then().statusCode(401);
  }

  @Test
  @Order(6)
  void recoveryCodeWorksOnceAndOnlyOnce() {
    String code = recoveryCodes.get(0);
    String pending = login().then().extract().path("pendingToken");
    verify(pending, code, "RECOVERY").then().statusCode(200).body("token", notNullValue());

    String pending2 = login().then().extract().path("pendingToken");
    verify(pending2, code, "RECOVERY").then().statusCode(401);

    // ...but the others still work, dashes optional.
    String pending3 = login().then().extract().path("pendingToken");
    verify(pending3, recoveryCodes.get(1).replace("-", ""), "RECOVERY")
        .then()
        .statusCode(200);
  }

  @Test
  @Order(7)
  void fiveWrongCodesKillTheChallenge() {
    String pending = login().then().extract().path("pendingToken");
    for (int i = 0; i < 5; i++) {
      verify(pending, "000000", "TOTP").then().statusCode(401);
    }
    // even a correct code now fails — the row is gone
    verify(pending, currentTotp(), "TOTP").then().statusCode(401);
    QuarkusTransaction.requiringNew()
        .run(() -> assertEquals(0, PendingLogin.count("user.email", EMAIL)));
  }

  @Test
  @Order(8)
  void unknownPendingTokenIsUnauthorized() {
    verify("nope", "123456", "TOTP").then().statusCode(401);
  }

  @Test
  @Order(9)
  void regenerateRequiresTotpAndInvalidatesOldCodes() {
    given()
        .auth()
        .oauth2(jwt)
        .contentType(ContentType.JSON)
        .body("{\"code\": \"000000\"}")
        .when()
        .post("/users/me/2fa/recovery-codes")
        .then()
        .statusCode(400);

    List<String> newCodes =
        given()
            .auth()
            .oauth2(jwt)
            .contentType(ContentType.JSON)
            .body("{\"code\": \"" + currentTotp() + "\"}")
            .when()
            .post("/users/me/2fa/recovery-codes")
            .then()
            .statusCode(200)
            .body("$", hasSize(8))
            .extract()
            .jsonPath()
            .getList(".");

    // old codes are dead, new ones live
    String pending = login().then().extract().path("pendingToken");
    verify(pending, recoveryCodes.get(2), "RECOVERY").then().statusCode(401);
    String pending2 = login().then().extract().path("pendingToken");
    verify(pending2, newCodes.get(0), "RECOVERY").then().statusCode(200);
    recoveryCodes = newCodes;
  }

  @Test
  @Order(10)
  void disableRequiresASecondFactor() {
    given()
        .auth()
        .oauth2(jwt)
        .contentType(ContentType.JSON)
        .body("{\"code\": \"000000\", \"codeType\": \"TOTP\"}")
        .when()
        .delete("/users/me/2fa")
        .then()
        .statusCode(400);

    given()
        .auth()
        .oauth2(jwt)
        .contentType(ContentType.JSON)
        .body("{\"code\": \"" + currentTotp() + "\", \"codeType\": \"TOTP\"}")
        .when()
        .delete("/users/me/2fa")
        .then()
        .statusCode(204);

    // back to one-step login, recovery codes wiped
    login().then().statusCode(200).body("status", is("AUTHENTICATED"));
    QuarkusTransaction.requiringNew()
        .run(
            () -> {
              User user = User.findByEmail(EMAIL);
              org.junit.jupiter.api.Assertions.assertNull(user.totpSecret);
              org.junit.jupiter.api.Assertions.assertFalse(user.totpEnabled);
            });
  }
}
