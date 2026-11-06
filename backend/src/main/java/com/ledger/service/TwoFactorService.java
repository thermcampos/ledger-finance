package com.ledger.service;

import com.ledger.email.EmailSendException;
import com.ledger.email.EmailService;
import com.ledger.email.SecurityEventEmail;
import com.ledger.entity.PendingLogin;
import com.ledger.entity.RecoveryCode;
import com.ledger.entity.User;
import com.ledger.security.SecretEncryptionService;
import com.ledger.security.TotpService;
import io.quarkus.elytron.security.common.BcryptUtil;
import io.quarkus.qute.Location;
import io.quarkus.qute.Template;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

/**
 * Opt-in TOTP two-factor authentication (ADR-0003).
 *
 * <p>Enrollment is two-step: {@link #setup} writes an inert secret ({@code totpEnabled} stays
 * false, so login ignores it) and only {@link #enable} — gated on a first valid code — turns it
 * on and issues the one-time recovery codes. Login for an enabled account goes through a {@link
 * PendingLogin} challenge row (2-minute TTL, 5 attempts shared by both code types) instead of
 * getting a JWT straight away.
 *
 * <p>Security-event emails (enabled / disabled / codes regenerated / a recovery code was used)
 * are the out-of-band tripwire; a send failure is logged and never blocks the operation itself.
 *
 * <p>Every method is {@code dontRollbackOn = WebApplicationException.class}: a rejected code is a
 * normal outcome, not an error, and the attempt count it incremented must still commit — otherwise
 * the 5-attempt budget would never drain.
 */
@ApplicationScoped
public class TwoFactorService {

  private static final Logger LOG = Logger.getLogger(TwoFactorService.class);

  /** How long the login challenge lives. Tight on purpose: restarting login is cheap. */
  public static final Duration PENDING_TTL = Duration.ofMinutes(2);

  /** Wrong-code budget per challenge, TOTP and recovery codes combined. */
  public static final int MAX_ATTEMPTS = 5;

  public static final int RECOVERY_CODE_COUNT = 8;

  /** Recovery codes: unambiguous alphabet (no 0/O, 1/I/L), shown as XXXX-XXXX-XXXX. */
  private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  private static final int CODE_GROUPS = 3;
  private static final int CODE_GROUP_LENGTH = 4;

  public enum CodeType {
    TOTP,
    RECOVERY
  }

  public record SetupResult(String otpauthUri, String manualKey) {}

  /** A rendered security-event email; exposed for snapshot tests (same shape as the digest's). */
  public record RenderedSecurityEvent(String subject, String html, String text) {}

  @Inject TotpService totpService;

  @Inject SecretEncryptionService encryption;

  @Inject EmailService emailService;

  @Location("email/security-event.html")
  Template htmlTemplate;

  @Location("email/security-event.txt")
  Template textTemplate;

  @ConfigProperty(name = "ledger.app.url")
  String appUrl;

  private final SecureRandom random = new SecureRandom();

  /**
   * Starts (or restarts) enrollment: a fresh secret replaces any previous one. Inert until {@link
   * #enable} verifies a code against it.
   */
  @Transactional(dontRollbackOn = WebApplicationException.class)
  public SetupResult setup(User user) {
    if (user.totpEnabled) {
      throw new WebApplicationException(
          "Two-factor authentication is already on — disable it first to re-enroll", 400);
    }
    String secret = totpService.generateSecret();
    user.totpSecret = encryption.encrypt(secret);
    return new SetupResult(
        totpService.otpauthUri(secret, user.email), totpService.manualKey(secret));
  }

  /**
   * Confirms enrollment with a first code from the authenticator, enables 2FA, and returns the
   * recovery codes — the only time they are ever shown.
   */
  @Transactional(dontRollbackOn = WebApplicationException.class)
  public List<String> enable(User user, String code) {
    if (user.totpEnabled) {
      throw new WebApplicationException("Two-factor authentication is already on", 400);
    }
    if (user.totpSecret == null) {
      throw new WebApplicationException("Start two-factor setup first", 400);
    }
    if (!verifyTotp(user, code)) {
      throw new WebApplicationException(
          "That code doesn't match — check your authenticator app and try again", 400);
    }
    user.totpEnabled = true;
    List<String> codes = replaceRecoveryCodes(user);
    notify(
        user,
        "Two-factor authentication enabled",
        "Sign-ins now ask for a code",
        "Two-factor authentication was enabled for your account. From now on, signing in asks for"
            + " a code from your authenticator app after your password.",
        "2fa-enabled");
    return codes;
  }

  /** Turns 2FA off. Requires a current second factor, so a stolen password session can't. */
  @Transactional(dontRollbackOn = WebApplicationException.class)
  public void disable(User user, String code, CodeType codeType) {
    requireEnabled(user);
    if (!verifyAny(user, code, codeType)) {
      throw new WebApplicationException("That code isn't valid", 400);
    }
    user.totpEnabled = false;
    user.totpSecret = null;
    RecoveryCode.deleteByUser(user.id);
    PendingLogin.deleteByUser(user.id);
    notify(
        user,
        "Two-factor authentication disabled",
        "Sign-ins no longer ask for a code",
        "Two-factor authentication was disabled for your account. Signing in now only needs your"
            + " password.",
        "2fa-disabled");
  }

  /** Replaces all recovery codes (invalidating the old set); returns the new codes, shown once. */
  @Transactional(dontRollbackOn = WebApplicationException.class)
  public List<String> regenerateRecoveryCodes(User user, String code) {
    requireEnabled(user);
    if (!verifyTotp(user, code)) {
      throw new WebApplicationException("That code isn't valid", 400);
    }
    List<String> codes = replaceRecoveryCodes(user);
    notify(
        user,
        "Recovery codes regenerated",
        "Your old recovery codes no longer work",
        "The recovery codes for your account were regenerated. Any previously saved codes stopped"
            + " working.",
        "2fa-codes-regenerated");
    return codes;
  }

  /**
   * Opens the login challenge after a correct password. Any previous challenge for the user is
   * replaced, and expired rows are purged opportunistically (no scheduled job).
   */
  @Transactional(dontRollbackOn = WebApplicationException.class)
  public String createPendingLogin(User user) {
    PendingLogin.deleteExpired(Instant.now());
    PendingLogin.deleteByUser(user.id);
    PendingLogin pending = new PendingLogin();
    byte[] bytes = new byte[32]; // 256 bits, unguessable
    random.nextBytes(bytes);
    pending.token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    pending.user = user;
    pending.attempts = 0;
    pending.createdAt = Instant.now();
    pending.expiresAt = pending.createdAt.plus(PENDING_TTL);
    pending.persist();
    return pending.token;
  }

  /**
   * Exchanges a pending-login token plus a second-factor code for the user to authenticate.
   *
   * @throws WebApplicationException 401 when the token is unknown/expired/exhausted ("restart
   *     login") or the code is wrong (attempt counted)
   */
  @Transactional(dontRollbackOn = WebApplicationException.class)
  public User verifyPendingLogin(String token, String code, CodeType codeType) {
    PendingLogin pending = token == null ? null : PendingLogin.findByToken(token);
    if (pending == null) {
      throw challengeDead();
    }
    if (pending.expiresAt.isBefore(Instant.now())) {
      pending.delete();
      throw challengeDead();
    }
    User user = pending.user;
    if (!user.totpEnabled) { // 2FA was disabled mid-challenge — the challenge is meaningless
      pending.delete();
      throw challengeDead();
    }
    RecoveryCode consumed = null;
    boolean ok =
        switch (codeType) {
          case TOTP -> verifyTotp(user, code);
          case RECOVERY -> {
            consumed = matchRecoveryCode(user, code);
            yield consumed != null;
          }
        };
    if (ok) {
      pending.delete();
      if (consumed != null) {
        notifyRecoveryCodeUsed(user, consumed.id);
      }
      return user;
    }
    pending.attempts++;
    if (pending.attempts >= MAX_ATTEMPTS) {
      pending.delete();
      throw challengeDead();
    }
    throw new WebApplicationException(
        "That code isn't valid — " + (MAX_ATTEMPTS - pending.attempts) + " attempts left", 401);
  }

  private static WebApplicationException challengeDead() {
    return new WebApplicationException(
        "This sign-in challenge expired — please sign in again", 401);
  }

  private boolean verifyAny(User user, String code, CodeType codeType) {
    return switch (codeType) {
      case TOTP -> verifyTotp(user, code);
      case RECOVERY -> matchRecoveryCode(user, code) != null;
    };
  }

  private boolean verifyTotp(User user, String code) {
    if (user.totpSecret == null) {
      return false;
    }
    String secret = encryption.decrypt(user.totpSecret);
    return totpService.verify(secret, code, Instant.now());
  }

  /** Marks the matching unused code consumed and returns it, or null when nothing matches. */
  private RecoveryCode matchRecoveryCode(User user, String code) {
    if (code == null) {
      return null;
    }
    String normalized = code.replace("-", "").replace(" ", "").toUpperCase();
    for (RecoveryCode rc : RecoveryCode.findUnusedByUser(user.id)) {
      if (BcryptUtil.matches(normalized, rc.codeHash)) {
        rc.usedAt = Instant.now();
        return rc;
      }
    }
    return null;
  }

  private List<String> replaceRecoveryCodes(User user) {
    RecoveryCode.deleteByUser(user.id);
    List<String> plaintext = new ArrayList<>();
    for (int i = 0; i < RECOVERY_CODE_COUNT; i++) {
      String code = generateRecoveryCode();
      RecoveryCode rc = new RecoveryCode();
      rc.user = user;
      rc.codeHash = BcryptUtil.bcryptHash(code.replace("-", ""));
      rc.createdAt = Instant.now();
      rc.persist();
      plaintext.add(code);
    }
    return plaintext;
  }

  private String generateRecoveryCode() {
    StringBuilder sb = new StringBuilder();
    for (int g = 0; g < CODE_GROUPS; g++) {
      if (g > 0) {
        sb.append('-');
      }
      for (int i = 0; i < CODE_GROUP_LENGTH; i++) {
        sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
      }
    }
    return sb.toString();
  }

  private void requireEnabled(User user) {
    if (!user.totpEnabled) {
      throw new WebApplicationException("Two-factor authentication isn't on for this account", 400);
    }
  }

  private void notifyRecoveryCodeUsed(User user, Long recoveryCodeId) {
    notify(
        user,
        "A recovery code was used",
        "One of your recovery codes was just used to sign in",
        "A recovery code was just used to sign in to your account, and it can't be used again."
            + " If you're running low, regenerate them on your Profile page.",
        "2fa-recovery-used-" + user.id + "-" + recoveryCodeId);
  }

  public RenderedSecurityEvent render(SecurityEventEmail event) {
    return new RenderedSecurityEvent(
        event.subject(),
        htmlTemplate.data("event", event).render(),
        textTemplate.data("event", event).render());
  }

  private void notify(User user, String title, String preheader, String detail, String keyPrefix) {
    SecurityEventEmail event = new SecurityEventEmail(title, preheader, detail, appUrl + "/profile");
    String key = keyPrefix + "-" + user.id + "-" + Instant.now().getEpochSecond();
    try {
      RenderedSecurityEvent email = render(event);
      emailService.send(user.email, email.subject(), email.html(), email.text(), key);
    } catch (EmailSendException e) {
      // Security emails are the tripwire, not the gate — never lock a user out over email.
      LOG.warnf("Security email [%s] to %s failed: %s", title, user.email, e.getMessage());
    }
  }
}
