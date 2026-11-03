package com.ledger;

import static io.restassured.RestAssured.given;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** With no DIGEST_TRIGGER_SECRET configured, the internal endpoint refuses everyone. */
@QuarkusTest
@TestProfile(DailyDigestUnsetSecretTest.NoSecret.class)
class DailyDigestUnsetSecretTest {

  public static class NoSecret implements QuarkusTestProfile {
    @Override
    public Map<String, String> getConfigOverrides() {
      return Map.of("ledger.digest.trigger-secret", "");
    }
  }

  @Test
  void blankConfiguredSecretAlwaysForbids() {
    given().when().post("/internal/digests/daily").then().statusCode(403);
    given().header("X-Digest-Secret", "").when().post("/internal/digests/daily").then().statusCode(403);
    given()
        .header("X-Digest-Secret", "test-digest-secret")
        .when()
        .post("/internal/digests/daily")
        .then()
        .statusCode(403);
  }
}
