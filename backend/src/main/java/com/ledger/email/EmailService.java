package com.ledger.email;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.ProcessingException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.Optional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.rest.client.inject.RestClient;
import org.jboss.logging.Logger;

/**
 * The one way Ledger sends email (docs/adr/0002-transactional-email-via-resend.md).
 *
 * <p>With {@code ledger.email.enabled=false} (everywhere but prod) nothing leaves the process: the
 * plain-text body is logged instead. Every send carries an idempotency key derived from the
 * logical event, so a retry with the same key never produces a second email.
 */
@ApplicationScoped
public class EmailService {

  private static final Logger LOG = Logger.getLogger(EmailService.class);

  private final ResendClient client;
  private final ObjectMapper mapper;
  private final boolean enabled;
  private final Optional<String> apiKey;
  private final String from;

  @Inject
  public EmailService(
      @RestClient ResendClient client,
      ObjectMapper mapper,
      @ConfigProperty(name = "ledger.email.enabled") boolean enabled,
      @ConfigProperty(name = "ledger.resend.api-key") Optional<String> apiKey,
      @ConfigProperty(name = "ledger.email.from") String from) {
    this.client = client;
    this.mapper = mapper;
    this.enabled = enabled;
    this.apiKey = apiKey;
    this.from = from;
  }

  /** False outside prod: {@link #send} only logs. */
  public boolean isEnabled() {
    return enabled;
  }

  /**
   * Sends one email, or logs it when email is disabled.
   *
   * @return Resend's message id, or empty when the email was only logged
   * @throws EmailSendException when Resend answers non-2xx, can't be reached, or no API key is set
   */
  public Optional<String> send(
      String to, String subject, String html, String text, String idempotencyKey) {
    requireText(to, "to");
    requireText(subject, "subject");
    requireText(idempotencyKey, "idempotencyKey");

    if (!enabled) {
      LOG.infof(
          "Email disabled (ledger.email.enabled=false) — not sending [%s] to %s, key %s:%n%s",
          subject, to, idempotencyKey, text);
      return Optional.empty();
    }
    String key = apiKey.filter(k -> !k.isBlank()).orElse(null);
    if (key == null) {
      throw new EmailSendException(0, "Email isn't configured (missing RESEND_API_KEY)");
    }

    ResendSendRequest body = new ResendSendRequest(from, List.of(to), subject, html, text);
    try {
      ResendSendResponse response = client.send("Bearer " + key, idempotencyKey, body);
      String id = response == null ? null : response.id;
      LOG.infof("Email [%s] sent, key %s, resend id %s", subject, idempotencyKey, id);
      return Optional.ofNullable(id);
    } catch (WebApplicationException e) {
      Response r = e.getResponse();
      int status = r == null ? 0 : r.getStatus();
      throw new EmailSendException(status, "Resend " + status + ": " + resendMessage(r));
    } catch (ProcessingException e) {
      throw new EmailSendException("Resend unreachable: " + e.getMessage(), e);
    }
  }

  /** Resend errors look like {@code {"statusCode":422,"name":"…","message":"…"}}. */
  private String resendMessage(Response response) {
    if (response == null) {
      return "no response";
    }
    String raw;
    try {
      raw = response.readEntity(String.class);
    } catch (RuntimeException e) {
      return "unreadable error body";
    }
    if (raw == null || raw.isBlank()) {
      return "empty error body";
    }
    try {
      JsonNode message = mapper.readTree(raw).path("message");
      if (message.isTextual() && !message.asText().isBlank()) {
        return message.asText();
      }
    } catch (Exception ignored) {
      // Not JSON (e.g. a proxy's HTML error page) — fall through to the raw body.
    }
    return raw.length() > 300 ? raw.substring(0, 300) + "…" : raw;
  }

  private static void requireText(String value, String name) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(name + " is required");
    }
  }
}
