package com.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.ledger.security.SecretEncryptionService;
import java.util.Base64;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SecretEncryptionServiceTest {

  private static String key32() {
    byte[] key = new byte[32];
    new java.security.SecureRandom().nextBytes(key);
    return Base64.getEncoder().encodeToString(key);
  }

  @Test
  void roundTrips() {
    SecretEncryptionService service = new SecretEncryptionService(Optional.of(key32()));
    String secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    assertEquals(secret, service.decrypt(service.encrypt(secret)));
  }

  @Test
  void ciphertextDiffersPerEncryption() {
    SecretEncryptionService service = new SecretEncryptionService(Optional.of(key32()));
    assertNotEquals(service.encrypt("same"), service.encrypt("same")); // random IV
  }

  @Test
  void wrongKeyFails() {
    SecretEncryptionService a = new SecretEncryptionService(Optional.of(key32()));
    SecretEncryptionService b = new SecretEncryptionService(Optional.of(key32()));
    assertThrows(IllegalStateException.class, () -> b.decrypt(a.encrypt("secret")));
  }

  @Test
  void rejectsWrongKeyLength() {
    String short16 = Base64.getEncoder().encodeToString(new byte[16]);
    assertThrows(
        IllegalStateException.class, () -> new SecretEncryptionService(Optional.of(short16)));
  }

  @Test
  void blankKeyWorksOutsideProd() {
    SecretEncryptionService service = new SecretEncryptionService(Optional.empty());
    assertEquals("x", service.decrypt(service.encrypt("x")));
  }
}
