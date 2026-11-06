package com.ledger.resource;

import com.ledger.dto.response.AuthResponse;
import com.ledger.email.EmailSendException;
import com.ledger.email.EmailService;
import com.ledger.entity.AccountHistoryEntry;
import com.ledger.entity.User;
import com.ledger.enums.AccountHistoryField;
import com.ledger.security.CurrentUserService;
import com.ledger.security.TokenService;
import com.ledger.service.DailyDigestService;
import com.ledger.service.TwoFactorService;
import io.quarkus.elytron.security.common.BcryptUtil;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Path("/users")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class UserResource {

  @Inject CurrentUserService currentUser;

  @Inject TokenService tokenService;

  @Inject DailyDigestService digestService;

  @Inject TwoFactorService twoFactorService;

  @Inject EmailService emailService;

  @GET
  @Path("/me")
  public MeResponse me() {
    User user = currentUser.require();
    return new MeResponse(
        user.email, user.displayName, user.createdAt, user.emailSummariesEnabled, user.totpEnabled);
  }

  /**
   * Starts (or restarts) 2FA enrollment: a fresh TOTP secret, returned as an otpauth URI for the
   * QR code plus a manual key. Inert until {@link #enableTwoFactor} verifies a first code
   * (ADR-0003). The secret is never returned again.
   */
  @POST
  @Path("/me/2fa/setup")
  @Consumes(MediaType.WILDCARD) // no body; don't 415 a bare POST
  @Transactional // start the tx before currentUser.require() loads the User, so mutations flush
  public TwoFactorService.SetupResult setupTwoFactor() {
    return twoFactorService.setup(currentUser.require());
  }

  /** Confirms enrollment with a first authenticator code; returns the recovery codes, shown once. */
  @POST
  @Path("/me/2fa/enable")
  @Transactional
  public List<String> enableTwoFactor(@Valid TwoFactorCodeRequest request) {
    return twoFactorService.enable(currentUser.require(), request.code());
  }

  /** Turns 2FA off — requires a current second factor so a stolen session can't. */
  @DELETE
  @Path("/me/2fa")
  @Transactional
  public void disableTwoFactor(@Valid TwoFactorManagementRequest request) {
    twoFactorService.disable(currentUser.require(), request.code(), request.codeType());
  }

  /** Replaces the recovery-code set, invalidating the old one; returns the new codes, shown once. */
  @POST
  @Path("/me/2fa/recovery-codes")
  @Transactional
  public List<String> regenerateRecoveryCodes(@Valid TwoFactorCodeRequest request) {
    return twoFactorService.regenerateRecoveryCodes(currentUser.require(), request.code());
  }

  @PUT
  @Path("/me")
  @Transactional
  public AuthResponse updateProfile(@Valid UpdateProfileRequest request) {
    User user = currentUser.require();

    if (!request.email.equalsIgnoreCase(user.email) && User.findByEmail(request.email) != null) {
      throw new WebApplicationException("An account with this email already exists", 409);
    }

    if (!request.displayName.equals(user.displayName)) {
      recordHistory(user, AccountHistoryField.DISPLAY_NAME, user.displayName, request.displayName);
    }
    if (!request.email.equalsIgnoreCase(user.email)) {
      recordHistory(user, AccountHistoryField.EMAIL, user.email, request.email);
    }

    user.email = request.email;
    user.displayName = request.displayName;
    if (request.emailSummariesEnabled != null) {
      user.emailSummariesEnabled = request.emailSummariesEnabled;
    }

    // Re-issue the token: the JWT's principal is the email, so a changed
    // email would otherwise 401 the very next request under the old token.
    return tokenService.issueToken(user);
  }

  @PUT
  @Path("/me/password")
  @Transactional
  public void changePassword(@Valid ChangePasswordRequest request) {
    User user = currentUser.require();
    if (!BcryptUtil.matches(request.currentPassword, user.passwordHash)) {
      // 400, not 401: the user IS authenticated here, this is a validation
      // failure of the request body — a 401 would trip the frontend's
      // global "session expired" interceptor and force an unwanted logout.
      throw new WebApplicationException("Current password is incorrect", 400);
    }
    user.passwordHash = BcryptUtil.bcryptHash(request.newPassword);
    recordHistory(user, AccountHistoryField.PASSWORD, null, null);
  }

  /**
   * Profile → "Send test email": today's digest to the current user, now. Ignores the "Email
   * summaries" master switch (that's what you'd test before turning it on). Errors carry a
   * {@code message} the Profile page shows inline.
   */
  @POST
  @Path("/me/digest/test")
  @Consumes(MediaType.WILDCARD) // no body; don't 415 a bare POST
  public DigestTestResponse sendTestDigest() {
    User user = currentUser.require();
    try {
      digestService.sendTest(user);
    } catch (DailyDigestService.NothingToSendException e) {
      throw error(400, e.getMessage());
    } catch (DailyDigestService.TooSoonException e) {
      throw error(429, e.getMessage());
    } catch (EmailSendException e) {
      throw error(502, "Couldn't send the test email: " + e.getMessage());
    }
    return new DigestTestResponse(user.email, emailService.isEnabled());
  }

  private static WebApplicationException error(int status, String message) {
    return new WebApplicationException(
        Response.status(status)
            .type(MediaType.APPLICATION_JSON)
            .entity(Map.of("message", message))
            .build());
  }

  @GET
  @Path("/me/history")
  public List<AccountHistoryEntry> history() {
    User user = currentUser.require();
    return AccountHistoryEntry.findByUser(user.id);
  }

  private void recordHistory(
      User user, AccountHistoryField field, String oldValue, String newValue) {
    AccountHistoryEntry entry = new AccountHistoryEntry();
    entry.user = user;
    entry.field = field;
    entry.oldValue = oldValue;
    entry.newValue = newValue;
    entry.changedAt = Instant.now();
    entry.persist();
  }

  public static class UpdateProfileRequest {
    @Email @NotBlank public String email;
    @NotBlank public String displayName;

    /** Daily digest master switch; null leaves it unchanged. */
    public Boolean emailSummariesEnabled;
  }

  public static class ChangePasswordRequest {
    @NotBlank public String currentPassword;

    @NotBlank
    @Size(min = 8, message = "Password must be at least 8 characters")
    public String newPassword;
  }

  /**
   * @param delivered false when email is disabled on this server (dev) and the digest was only
   *     written to the log
   */
  public record DigestTestResponse(String to, boolean delivered) {}

  public record TwoFactorCodeRequest(@NotBlank String code) {}

  public record TwoFactorManagementRequest(
      @NotBlank String code, @NotNull TwoFactorService.CodeType codeType) {}

  public static class MeResponse {
    public String email;
    public String displayName;
    public Instant createdAt;
    public boolean emailSummariesEnabled;
    public boolean totpEnabled;

    public MeResponse(
        String email,
        String displayName,
        Instant createdAt,
        boolean emailSummariesEnabled,
        boolean totpEnabled) {
      this.email = email;
      this.displayName = displayName;
      this.createdAt = createdAt;
      this.emailSummariesEnabled = emailSummariesEnabled;
      this.totpEnabled = totpEnabled;
    }
  }
}
