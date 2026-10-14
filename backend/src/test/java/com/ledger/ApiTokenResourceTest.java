package com.ledger;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

@QuarkusTest
class ApiTokenResourceTest {

  private static String jwt;

  @BeforeAll
  static void seed() {
    LlmTestSupport.createUser("token-crud@example.com");
    jwt = LlmTestSupport.jwt("token-crud@example.com");
  }

  @Test
  void createReturnsPlaintextOnceAndListShowsMetadataOnly() {
    var response =
        given()
            .auth()
            .oauth2(jwt)
            .contentType(ContentType.JSON)
            .body("{\"name\": \"ChatGPT\", \"scope\": \"read\"}")
            .when()
            .post("/users/me/tokens")
            .then()
            .statusCode(200)
            .body("name", is("ChatGPT"))
            .body("scope", is("read"))
            .body("token", startsWith("led_"))
            .body("expiresAt", notNullValue())
            .extract();

    long id = response.jsonPath().getLong("id");

    given()
        .auth()
        .oauth2(jwt)
        .when()
        .get("/users/me/tokens")
        .then()
        .statusCode(200)
        .body("find { it.id == " + id + " }.name", is("ChatGPT"))
        .body("find { it.id == " + id + " }.token", nullValue())
        .body("find { it.id == " + id + " }.tokenHash", nullValue())
        .body("find { it.id == " + id + " }.lastUsedAt", nullValue());
  }

  @Test
  void readWriteScopeIsRejected() {
    given()
        .auth()
        .oauth2(jwt)
        .contentType(ContentType.JSON)
        .body("{\"name\": \"evil\", \"scope\": \"read-write\"}")
        .when()
        .post("/users/me/tokens")
        .then()
        .statusCode(400);
  }

  @Test
  void deleteRevokes() {
    long id =
        given()
            .auth()
            .oauth2(jwt)
            .contentType(ContentType.JSON)
            .body("{\"name\": \"temp\"}")
            .when()
            .post("/users/me/tokens")
            .then()
            .statusCode(200)
            .extract()
            .jsonPath()
            .getLong("id");

    given().auth().oauth2(jwt).when().delete("/users/me/tokens/" + id).then().statusCode(204);

    given()
        .auth()
        .oauth2(jwt)
        .when()
        .get("/users/me/tokens")
        .then()
        .statusCode(200)
        .body("find { it.id == " + id + " }", nullValue());
  }

  @Test
  void deleteOtherUsersTokenIs404() {
    Long otherUserId = LlmTestSupport.createUser("token-other@example.com");
    // Persist a token for the other user, then try to delete it with our JWT.
    String plaintext = LlmTestSupport.createApiToken(otherUserId);
    Long tokenId = LlmTestSupport.findTokenId(plaintext);

    given()
        .auth()
        .oauth2(jwt)
        .when()
        .delete("/users/me/tokens/" + tokenId)
        .then()
        .statusCode(404);
  }

  @Test
  void requiresAuthentication() {
    given().when().get("/users/me/tokens").then().statusCode(401);
  }
}
