package com.ledger.security;

import io.quarkus.runtime.LaunchMode;
import jakarta.enterprise.context.ApplicationScoped;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * AES-GCM for the TOTP secret at rest (ADR-0003): a database leak (or an R2 backup) must not hand
 * out working second factors. The key comes from {@code TOTP_ENCRYPTION_KEY} (Base64, 32 bytes;
 * Doppler {@code prd}).
 *
 * <p>Ciphertext format: Base64 of {@code iv (12 bytes) || ciphertext || GCM tag}.
 *
 * <p>Outside prod a blank key falls back to an ephemeral random one with a warning — dev data is
 * disposable and drop-and-create wipes it anyway. In prod a blank key fails fast at first use:
 * silently re-keying would make every enrolled user's secret unreadable.
 */
@ApplicationScoped
public class SecretEncryptionService {

  private static final Logger LOG = Logger.getLogger(SecretEncryptionService.class);
  private static final int IV_BYTES = 12;
  private static final int TAG_BITS = 128;

  private final SecretKeySpec key;

  public SecretEncryptionService(
      @ConfigProperty(name = "ledger.totp.encryption-key") java.util.Optional<String> keyBase64) {
    String configured = keyBase64.orElse("").trim();
    if (configured.isEmpty()) {
      if (LaunchMode.current() == LaunchMode.NORMAL) {
        throw new IllegalStateException(
            "TOTP_ENCRYPTION_KEY is not set — prod cannot encrypt 2FA secrets without it");
      }
      byte[] ephemeral = new byte[32];
      new SecureRandom().nextBytes(ephemeral);
      this.key = new SecretKeySpec(ephemeral, "AES");
      LOG.warn(
          "TOTP_ENCRYPTION_KEY is not set — using an ephemeral key; 2FA secrets won't survive a"
              + " restart (fine in dev/test, never in prod)");
    } else {
      byte[] decoded = Base64.getDecoder().decode(configured);
      if (decoded.length != 32) {
        throw new IllegalStateException(
            "TOTP_ENCRYPTION_KEY must be 32 bytes Base64-encoded (got " + decoded.length + ")");
      }
      this.key = new SecretKeySpec(decoded, "AES");
    }
  }

  public String encrypt(String plaintext) {
    byte[] iv = new byte[IV_BYTES];
    new SecureRandom().nextBytes(iv);
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
      byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      byte[] combined = new byte[IV_BYTES + ciphertext.length];
      System.arraycopy(iv, 0, combined, 0, IV_BYTES);
      System.arraycopy(ciphertext, 0, combined, IV_BYTES, ciphertext.length);
      return Base64.getEncoder().encodeToString(combined);
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("AES-GCM encryption failed", e);
    }
  }

  public String decrypt(String encoded) {
    byte[] combined = Base64.getDecoder().decode(encoded);
    byte[] iv = new byte[IV_BYTES];
    System.arraycopy(combined, 0, iv, 0, IV_BYTES);
    try {
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
      return new String(
          cipher.doFinal(combined, IV_BYTES, combined.length - IV_BYTES),
          java.nio.charset.StandardCharsets.UTF_8);
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException(
          "TOTP secret doesn't decrypt — wrong TOTP_ENCRYPTION_KEY?", e);
    }
  }
}
