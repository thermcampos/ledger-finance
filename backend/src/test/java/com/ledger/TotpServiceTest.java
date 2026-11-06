package com.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ledger.security.TotpService;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/**
 * RFC 6238 with the authenticator-app parameters (SHA-1, 6 digits, 30s). The vectors are RFC 6238
 * Appendix B (SHA-1 set, seed "12345678901234567890" as ASCII, Base32 {@code GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ})
 * truncated to the last 6 digits, since Ledger issues 6-digit codes.
 */
class TotpServiceTest {

  private static final String RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  private final TotpService totp = new TotpService();

  private static long step(long epochSecond) {
    return epochSecond / 30;
  }

  @Test
  void matchesRfc6238AppendixBSha1Vectors() {
    assertEquals("287082", totp.codeAt(RFC_SECRET, step(59)));
    assertEquals("081804", totp.codeAt(RFC_SECRET, step(1111111109)));
    assertEquals("050471", totp.codeAt(RFC_SECRET, step(1111111111)));
    assertEquals("005924", totp.codeAt(RFC_SECRET, step(1234567890)));
    assertEquals("279037", totp.codeAt(RFC_SECRET, step(2000000000)));
    assertEquals("353130", totp.codeAt(RFC_SECRET, step(20000000000L)));
  }

  @Test
  void verifyAcceptsCurrentAndNeighborSteps() {
    Instant at = Instant.ofEpochSecond(1111111109);
    assertTrue(totp.verify(RFC_SECRET, "081804", at));
    // one step before and after (clock skew window)
    assertTrue(totp.verify(RFC_SECRET, totp.codeAt(RFC_SECRET, step(1111111109) - 1), at));
    assertTrue(totp.verify(RFC_SECRET, totp.codeAt(RFC_SECRET, step(1111111109) + 1), at));
    // two steps away is outside the window
    assertFalse(totp.verify(RFC_SECRET, totp.codeAt(RFC_SECRET, step(1111111109) + 2), at));
  }

  @Test
  void verifyRejectsMalformedCodes() {
    Instant now = Instant.ofEpochSecond(1111111109);
    assertFalse(totp.verify(RFC_SECRET, null, now));
    assertFalse(totp.verify(RFC_SECRET, "12345", now));
    assertFalse(totp.verify(RFC_SECRET, "1234567", now));
    assertFalse(totp.verify(RFC_SECRET, "abcdef", now));
  }

  @Test
  void generatedSecretsAreDistinctAndAuthenticatorShaped() {
    String a = totp.generateSecret();
    String b = totp.generateSecret();
    assertNotEquals(a, b);
    assertEquals(32, a.length()); // 20 bytes, Base32 unpadded
    assertTrue(a.matches("[A-Z2-7]+"));
  }

  @Test
  void otpauthUriCarriesIssuerAccountAndParameters() {
    String uri = totp.otpauthUri(RFC_SECRET, "me@example.com");
    assertTrue(uri.startsWith("otpauth://totp/Ledger%3Ame%40example.com?"), uri);
    assertTrue(uri.contains("secret=" + RFC_SECRET), uri);
    assertTrue(uri.contains("issuer=Ledger"), uri);
    assertTrue(uri.contains("algorithm=SHA1"), uri);
    assertTrue(uri.contains("digits=6"), uri);
    assertTrue(uri.contains("period=30"), uri);
  }

  @Test
  void manualKeyGroupsByFour() {
    assertEquals(
        "GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ", totp.manualKey(RFC_SECRET));
  }
}
