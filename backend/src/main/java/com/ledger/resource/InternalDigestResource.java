package com.ledger.resource;

import com.ledger.service.DailyDigestService;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Cluster-internal trigger for the daily digest — called by the {@code
 * ledger-finance-daily-digest} CronJob at 07:00 São Paulo time
 * (docs/adr/0001-scheduled-jobs-via-cronjob.md).
 *
 * <p>No JWT ({@code /internal/*} is a permit path). Instead:
 *
 * <ul>
 *   <li>Anything that came through the Traefik ingress (it always sets {@code X-Forwarded-For};
 *       in-cluster calls don't) → 404, as if the path didn't exist.
 *   <li>{@code X-Digest-Secret} must equal {@code ledger.digest.trigger-secret}, compared in
 *       constant time. A blank configured secret → always 403.
 * </ul>
 */
@Path("/internal/digests")
@PermitAll
public class InternalDigestResource {

  @Inject DailyDigestService digestService;

  @ConfigProperty(name = "ledger.digest.trigger-secret")
  Optional<String> triggerSecret;

  /**
   * Runs {@link DailyDigestService#sendAll()}. 200 with {@code {sent, skipped, failed}}; 500 (same
   * body) only when every attempted send failed, so the Job is marked failed and retried.
   */
  @POST
  @Path("/daily")
  @Consumes(MediaType.WILDCARD)
  @Produces(MediaType.APPLICATION_JSON)
  public Response daily(
      @HeaderParam("X-Forwarded-For") String forwardedFor,
      @HeaderParam("X-Digest-Secret") String providedSecret) {
    if (forwardedFor != null) {
      return Response.status(Response.Status.NOT_FOUND).build();
    }
    if (!secretMatches(providedSecret)) {
      return Response.status(Response.Status.FORBIDDEN).build();
    }
    DailyDigestService.RunResult result = digestService.sendAll();
    boolean allFailed = result.failed() > 0 && result.sent() == 0;
    return Response.status(allFailed ? 500 : 200).entity(result).build();
  }

  private boolean secretMatches(String provided) {
    String expected = triggerSecret.filter(s -> !s.isBlank()).orElse(null);
    if (expected == null || provided == null) {
      return false;
    }
    return MessageDigest.isEqual(
        expected.getBytes(StandardCharsets.UTF_8), provided.getBytes(StandardCharsets.UTF_8));
  }
}
