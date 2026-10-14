package com.ledger.security;

import io.quarkus.arc.Unremovable;
import io.quarkus.security.identity.IdentityProviderManager;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.request.AuthenticationRequest;
import io.quarkus.vertx.http.runtime.security.ChallengeData;
import io.quarkus.vertx.http.runtime.security.HttpAuthenticationMechanism;
import io.quarkus.vertx.http.runtime.security.HttpCredentialTransport;
import io.smallrye.mutiny.Uni;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.Set;

/**
 * Authenticates {@code led_} bearer tokens, valid only under /llm/**. Declared path-specific via
 * {@link #getCredentialTransport(RoutingContext)} and ordered ahead of the JWT mechanism, so it
 * never interferes with browser sessions: for any other path (or a bearer value without the {@code
 * led_} prefix) it abstains and the request falls through to JWT auth.
 */
@Unremovable // only looked up via Instance<HttpAuthenticationMechanism>, never injected
@ApplicationScoped
public class ApiTokenAuthMechanism implements HttpAuthenticationMechanism {

  public static final String TOKEN_PREFIX = "led_";

  // Mechanisms are tried in descending priority order (Basic=2000, JWT=1000). Ours must run
  // before JWT because the JWT mechanism fails hard on a bearer token it cannot parse instead of
  // abstaining — a led_ token would otherwise 401 before we ever see it.
  private static final int PRIORITY = DEFAULT_PRIORITY + 500;

  @Override
  public int getPriority() {
    return PRIORITY;
  }

  @Override
  public Uni<SecurityIdentity> authenticate(
      RoutingContext context, IdentityProviderManager identityProviderManager) {
    if (!isLlmPath(context)) {
      return Uni.createFrom().nullItem();
    }
    String header = context.request().getHeader("Authorization");
    if (header == null || !header.startsWith("Bearer ")) {
      return Uni.createFrom().nullItem();
    }
    String token = header.substring("Bearer ".length()).trim();
    if (!token.startsWith(TOKEN_PREFIX)) {
      // Not one of ours (e.g. a browser JWT) — abstain; /llm resources then reject the
      // resulting identity via @RolesAllowed("token-read").
      return Uni.createFrom().nullItem();
    }
    return identityProviderManager.authenticate(
        new ApiTokenAuthenticationRequest(new ApiTokenCredential(token)));
  }

  @Override
  public Uni<ChallengeData> getChallenge(RoutingContext context) {
    return Uni.createFrom().item(new ChallengeData(401, "WWW-Authenticate", "Bearer"));
  }

  @Override
  public Set<Class<? extends AuthenticationRequest>> getCredentialTypes() {
    return Set.of(ApiTokenAuthenticationRequest.class);
  }

  @Override
  public Uni<HttpCredentialTransport> getCredentialTransport(RoutingContext context) {
    if (isLlmPath(context)) {
      return Uni.createFrom()
          .item(new HttpCredentialTransport(HttpCredentialTransport.Type.AUTHORIZATION, "Bearer"));
    }
    return Uni.createFrom().nullItem();
  }

  private static boolean isLlmPath(RoutingContext context) {
    String path = context.request().path();
    return path.equals("/llm") || path.startsWith("/llm/");
  }
}
