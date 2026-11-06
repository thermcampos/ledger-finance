package com.ledger.security;

import jakarta.enterprise.context.ApplicationScoped;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Instant;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Hand-rolled RFC 6238 TOTP (ADR-0003): SHA-1, 6 digits, 30-second steps, ±1 step window for
 * clock skew — the parameters every authenticator app defaults to. Secrets are 160-bit,
 * Base32-encoded (no padding) so they can be typed by hand from the enrollment screen.
 *
 * <p>Verified against the RFC 6238 Appendix B test vectors in {@code TotpServiceTest}.
 */
@ApplicationScoped
public class TotpService {

  private static final String HMAC_ALGORITHM = "HmacSHA1";
  private static final int SECRET_BYTES = 20; // 160 bits, the RFC 4226 recommended minimum
  private static final int CODE_DIGITS = 6;
  private static final int STEP_SECONDS = 30;
  private static final int SKEW_STEPS = 1;
  private static final String BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  private final SecureRandom random = new SecureRandom();

  /** A new random secret, Base32 without padding (what authenticator apps expect). */
  public String generateSecret() {
    byte[] bytes = new byte[SECRET_BYTES];
    random.nextBytes(bytes);
    return base32Encode(bytes);
  }

  /** True when {@code code} matches the secret in the current step or either neighbor. */
  public boolean verify(String base32Secret, String code, Instant at) {
    if (code == null || !code.matches("\\d{6}")) {
      return false;
    }
    long step = at.getEpochSecond() / STEP_SECONDS;
    for (long s = step - SKEW_STEPS; s <= step + SKEW_STEPS; s++) {
      if (codeAt(base32Secret, s).equals(code)) {
        return true;
      }
    }
    return false;
  }

  /** The 6-digit code for one time step — public so tests can drive the login flow. */
  public String codeAt(String base32Secret, long timeStep) {
    byte[] key = base32Decode(base32Secret);
    byte[] counter = new byte[8];
    for (int i = 7; i >= 0; i--) {
      counter[i] = (byte) (timeStep & 0xff);
      timeStep >>= 8;
    }
    byte[] hash;
    try {
      Mac mac = Mac.getInstance(HMAC_ALGORITHM);
      mac.init(new SecretKeySpec(key, HMAC_ALGORITHM));
      hash = mac.doFinal(counter);
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("HmacSHA1 unavailable", e);
    }
    // RFC 4226 dynamic truncation
    int offset = hash[hash.length - 1] & 0x0f;
    int binary =
        ((hash[offset] & 0x7f) << 24)
            | ((hash[offset + 1] & 0xff) << 16)
            | ((hash[offset + 2] & 0xff) << 8)
            | (hash[offset + 3] & 0xff);
    int otp = binary % (int) Math.pow(10, CODE_DIGITS);
    return String.format("%0" + CODE_DIGITS + "d", otp);
  }

  /** {@code otpauth://} URI authenticator apps render as an account entry. */
  public String otpauthUri(String base32Secret, String email) {
    String label = "Ledger:" + email;
    return "otpauth://totp/"
        + URLEncoder.encode(label, StandardCharsets.UTF_8)
        + "?secret="
        + base32Secret
        + "&issuer=Ledger&algorithm=SHA1&digits="
        + CODE_DIGITS
        + "&period="
        + STEP_SECONDS;
  }

  /** The secret grouped for hand-copying: {@code ABCD EFGH …}. */
  public String manualKey(String base32Secret) {
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < base32Secret.length(); i++) {
      if (i > 0 && i % 4 == 0) {
        out.append(' ');
      }
      out.append(base32Secret.charAt(i));
    }
    return out.toString();
  }

  static String base32Encode(byte[] bytes) {
    StringBuilder out = new StringBuilder((bytes.length * 8 + 4) / 5);
    int buffer = 0;
    int bits = 0;
    for (byte b : bytes) {
      buffer = (buffer << 8) | (b & 0xff);
      bits += 8;
      while (bits >= 5) {
        out.append(BASE32_ALPHABET.charAt((buffer >> (bits - 5)) & 0x1f));
        bits -= 5;
      }
    }
    if (bits > 0) {
      out.append(BASE32_ALPHABET.charAt((buffer << (5 - bits)) & 0x1f));
    }
    return out.toString();
  }

  static byte[] base32Decode(String base32) {
    String cleaned = base32.replace(" ", "").replace("=", "").toUpperCase();
    byte[] result = new byte[cleaned.length() * 5 / 8];
    int buffer = 0;
    int bits = 0;
    int index = 0;
    for (char c : cleaned.toCharArray()) {
      int value = BASE32_ALPHABET.indexOf(c);
      if (value < 0) {
        throw new IllegalArgumentException("Not Base32: " + c);
      }
      buffer = (buffer << 5) | value;
      bits += 5;
      if (bits >= 8) {
        result[index++] = (byte) ((buffer >> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return result;
  }
}
