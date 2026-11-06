package com.ledger.resource;

import com.ledger.dto.request.LoginRequest;
import com.ledger.dto.request.SignupRequest;
import com.ledger.dto.request.TwoFactorChallengeRequest;
import com.ledger.dto.response.LoginResponse;
import com.ledger.security.TokenService;
import com.ledger.service.TwoFactorService;
import com.ledger.entity.User;
import io.quarkus.elytron.security.common.BcryptUtil;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.Instant;

@Path("/auth")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AuthResource {

  @Inject TokenService tokenService;

  @Inject TwoFactorService twoFactorService;

  @POST
  @Path("/signup")
  @Transactional
  public Response signup(@Valid SignupRequest request) {
    if (User.findByEmail(request.email()) != null) {
      throw new WebApplicationException("An account with this email already exists", 409);
    }

    User user = new User();
    user.email = request.email();
    user.displayName = request.displayName();
    user.passwordHash = BcryptUtil.bcryptHash(request.password());
    user.createdAt = Instant.now();
    user.persist();

    return Response.status(Response.Status.CREATED)
        .entity(LoginResponse.authenticated(tokenService.issueToken(user)))
        .build();
  }

  /**
   * Password check, then either the JWT straight away or — for 2FA-enabled accounts — a {@code
   * TWO_FACTOR_REQUIRED} challenge (ADR-0003): a short-lived opaque pending token to exchange at
   * {@link #verifyTwoFactor}. 200 in both cases: the credentials were valid, so 401 (which the
   * frontend reads as "session dead") would be wrong.
   */
  @POST
  @Path("/login")
  public Response login(@Valid LoginRequest request) {
    User user = User.findByEmail(request.email());
    if (user == null || !BcryptUtil.matches(request.password(), user.passwordHash)) {
      throw new WebApplicationException("Invalid email or password", 401);
    }
    if (user.totpEnabled) {
      return Response.ok(
              LoginResponse.twoFactorRequired(twoFactorService.createPendingLogin(user)))
          .build();
    }
    return Response.ok(LoginResponse.authenticated(tokenService.issueToken(user))).build();
  }

  /**
   * The second half of a 2FA login. PermitAll like {@code /auth/login}: the client has no JWT yet
   * — the pending token in the body (minted only after a correct password, 256-bit random,
   * 2-minute TTL, 5-attempt budget) is the credential.
   */
  @POST
  @Path("/login/2fa")
  public Response verifyTwoFactor(@Valid TwoFactorChallengeRequest request) {
    User user =
        twoFactorService.verifyPendingLogin(request.pendingToken(), request.code(), request.codeType());
    return Response.ok(tokenService.issueToken(user)).build();
  }
}
