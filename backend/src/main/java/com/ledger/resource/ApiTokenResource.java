package com.ledger.resource;

import com.ledger.entity.ApiToken;
import com.ledger.entity.User;
import com.ledger.security.ApiTokenAuthMechanism;
import com.ledger.security.CurrentUserService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;

/**
 * CRUD for LLM API tokens, JWT-authenticated (browser session) — the tokens themselves are valid
 * only under /llm/**. The plaintext token is returned exactly once, at creation; afterwards only
 * metadata is listed. Revocation is a hard delete.
 */
@Path("/users/me/tokens")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class ApiTokenResource {

  @Inject CurrentUserService currentUser;

  @POST
  @Transactional
  public CreateTokenResponse create(@Valid CreateTokenRequest request) {
    User user = currentUser.require();
    if (request.scope != null && !ApiToken.SCOPE_READ.equals(request.scope)) {
      // 'read-write' is reserved in the schema but intentionally not issuable in v0.
      throw new WebApplicationException("Only the 'read' scope is available", 400);
    }

    // No static SecureRandom field: it would be baked into the native image heap with a
    // cached seed. Token creation is rare, so per-call construction is fine.
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    String plaintext = ApiTokenAuthMechanism.TOKEN_PREFIX + HexFormat.of().formatHex(bytes);

    ApiToken token = new ApiToken();
    token.user = user;
    token.name = request.name;
    token.tokenHash = ApiToken.sha256Hex(plaintext);
    token.scope = ApiToken.SCOPE_READ;
    token.expiresAt = Instant.now().plus(365, ChronoUnit.DAYS);
    token.persist();

    return new CreateTokenResponse(
        token.id, token.name, token.scope, token.createdAt, token.expiresAt, plaintext);
  }

  @GET
  public List<TokenResponse> list() {
    User user = currentUser.require();
    return ApiToken.findByUser(user.id).stream().map(TokenResponse::new).toList();
  }

  @DELETE
  @Path("/{id}")
  @Transactional
  public void delete(@PathParam("id") Long id) {
    User user = currentUser.require();
    ApiToken token = ApiToken.findById(id);
    if (token == null || !token.user.id.equals(user.id)) {
      throw new NotFoundException();
    }
    token.delete();
  }

  public static class CreateTokenRequest {
    @NotBlank public String name;

    /** Optional; only 'read' is accepted in v0. */
    public String scope;
  }

  /** Token metadata — never the hash, never the plaintext. */
  public static class TokenResponse {
    public Long id;
    public String name;
    public String scope;
    public Instant createdAt;
    public Instant lastUsedAt;
    public Instant expiresAt;

    public TokenResponse(ApiToken token) {
      this.id = token.id;
      this.name = token.name;
      this.scope = token.scope;
      this.createdAt = token.createdAt;
      this.lastUsedAt = token.lastUsedAt;
      this.expiresAt = token.expiresAt;
    }
  }

  /** The only response that ever carries the plaintext token. */
  public static class CreateTokenResponse {
    public Long id;
    public String name;
    public String scope;
    public Instant createdAt;
    public Instant expiresAt;
    public String token;

    public CreateTokenResponse(
        Long id, String name, String scope, Instant createdAt, Instant expiresAt, String token) {
      this.id = id;
      this.name = name;
      this.scope = scope;
      this.createdAt = createdAt;
      this.expiresAt = expiresAt;
      this.token = token;
    }
  }
}
