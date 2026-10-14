package com.ledger.security;

import io.quarkus.arc.Unremovable;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.Map;

/**
 * Per-token rate limiting for /llm/**. Requests without a token identity (anonymous, browser
 * JWT) are left to the security layer. Note: in a @ServerRequestFilter, aborting is done by
 * returning a Response — ContainerRequestContext.abortWith is not honored there.
 */
@Unremovable // only looked up via the @ServerRequestFilter annotation, never injected
public class LlmRateLimitFilter {

  @Inject LlmRateLimiter rateLimiter;

  @Inject SecurityIdentity identity;

  @ServerRequestFilter
  public Response filter(ContainerRequestContext ctx) {
    String path = ctx.getUriInfo().getPath();
    if (!path.equals("/llm") && !path.startsWith("/llm/")) {
      return null;
    }
    Long tokenId = identity.getAttribute(ApiTokenIdentityProvider.ATTR_TOKEN_ID);
    if (tokenId == null) {
      return null;
    }
    if (!rateLimiter.tryAcquire(tokenId)) {
      return Response.status(429)
          .type(MediaType.APPLICATION_JSON)
          .entity(Map.of("message", "Rate limit exceeded"))
          .build();
    }
    return null;
  }
}
