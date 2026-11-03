package com.ledger.email;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

/**
 * Raw REST call to Resend's send-email API — no SDK, same native-image reasoning as {@code
 * AnthropicClient}. See docs/adr/0002-transactional-email-via-resend.md. Use through {@link
 * EmailService}, which handles the enabled switch, auth header and error mapping.
 */
@RegisterRestClient(configKey = "resend-api")
@Path("/emails")
public interface ResendClient {

  @POST
  @Produces(MediaType.APPLICATION_JSON)
  @Consumes(MediaType.APPLICATION_JSON)
  ResendSendResponse send(
      @HeaderParam("Authorization") String authorization,
      @HeaderParam("Idempotency-Key") String idempotencyKey,
      ResendSendRequest body);
}
