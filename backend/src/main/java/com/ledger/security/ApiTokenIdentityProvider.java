package com.ledger.security;

import com.ledger.entity.ApiToken;
import io.quarkus.arc.Unremovable;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.security.AuthenticationFailedException;
import io.quarkus.security.identity.AuthenticationRequestContext;
import io.quarkus.security.identity.IdentityProvider;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.request.AuthenticationRequest;
import io.quarkus.security.runtime.QuarkusSecurityIdentity;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;

/**
 * Resolves a {@code led_} bearer token to a SecurityIdentity with role {@code token-read}.
 * Lookup is by SHA-256 hash; expired or unknown tokens fail authentication. {@code lastUsedAt} is
 * stamped on every successful use. Panache runs blocking, so the work is offloaded via {@code
 * runBlocking} and the write side runs in its own transaction.
 */
@Unremovable // only looked up via Instance<IdentityProvider>, never injected
@ApplicationScoped
public class ApiTokenIdentityProvider implements IdentityProvider<ApiTokenAuthenticationRequest> {

  public static final String ROLE = "token-read";
  public static final String ATTR_TOKEN_ID = "tokenId";
  public static final String ATTR_USER_ID = "userId";

  @Override
  public Class<ApiTokenAuthenticationRequest> getRequestType() {
    return ApiTokenAuthenticationRequest.class;
  }

  @Override
  public Uni<SecurityIdentity> authenticate(
      ApiTokenAuthenticationRequest request, AuthenticationRequestContext context) {
    return context.runBlocking(() -> authenticateBlocking(request.getToken().getToken()));
  }

  private SecurityIdentity authenticateBlocking(String plaintext) {
    // The blocking executor thread has no CDI request context — the transaction doubles as the
    // scope that makes Panache usable here, and stamps lastUsedAt on the managed entity.
    return QuarkusTransaction.requiringNew()
        .call(
            () -> {
              ApiToken token = ApiToken.findByTokenHash(ApiToken.sha256Hex(plaintext));
              if (token == null) {
                throw new AuthenticationFailedException("Unknown API token");
              }
              if (token.expiresAt != null && token.expiresAt.isBefore(Instant.now())) {
                throw new AuthenticationFailedException("API token expired");
              }
              token.lastUsedAt = Instant.now();
              Long tokenId = token.id;
              Long userId = token.user.id;
              String email = token.user.email;
              return QuarkusSecurityIdentity.builder()
                  .setPrincipal(() -> email)
                  .addRole(ROLE)
                  .addAttribute(ATTR_TOKEN_ID, tokenId)
                  .addAttribute(ATTR_USER_ID, userId)
                  .build();
            });
  }
}
