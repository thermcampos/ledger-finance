package com.ledger.anthropic;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.rest.client.inject.RegisterRestClient;

/** Raw REST call to Claude's Messages API — no Anthropic SDK, see PLAN-import.md for why (GraalVM native-image risk). */
@RegisterRestClient(configKey = "anthropic-api")
@Path("/v1/messages")
public interface AnthropicClient {

    @POST
    @Produces(MediaType.APPLICATION_JSON)
    @Consumes(MediaType.APPLICATION_JSON)
    AnthropicMessageResponse createMessage(
            @HeaderParam("x-api-key") String apiKey,
            @HeaderParam("anthropic-version") String version,
            AnthropicMessageRequest body);
}
