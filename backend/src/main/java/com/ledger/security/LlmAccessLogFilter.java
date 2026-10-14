package com.ledger.security;

import io.quarkus.arc.Unremovable;
import org.jboss.resteasy.reactive.server.ServerResponseFilter;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import org.jboss.logging.Logger;

/**
 * Access log for /llm/**: tokenId + path + status only — never request/response bodies and never
 * the token itself.
 */
@Unremovable // only looked up via the @ServerResponseFilter annotation, never injected
public class LlmAccessLogFilter {

  private static final Logger LOG = Logger.getLogger(LlmAccessLogFilter.class);

  @Inject SecurityIdentity identity;

  @ServerResponseFilter
  public void filter(ContainerRequestContext request, ContainerResponseContext response) {
    String path = request.getUriInfo().getPath();
    if (!path.equals("/llm") && !path.startsWith("/llm/")) {
      return;
    }
    LOG.infof(
        "llm-access tokenId=%s path=%s status=%d",
        identity.getAttribute(ApiTokenIdentityProvider.ATTR_TOKEN_ID), path, response.getStatus());
  }
}
