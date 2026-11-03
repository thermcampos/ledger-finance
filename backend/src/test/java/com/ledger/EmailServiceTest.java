package com.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledger.email.EmailSendException;
import com.ledger.email.EmailService;
import com.ledger.email.ResendClient;
import com.ledger.email.ResendSendRequest;
import com.ledger.email.ResendSendResponse;
import jakarta.ws.rs.ProcessingException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/** Send path, log-only path and Resend error mapping, against a fake {@link ResendClient}. */
class EmailServiceTest {

  private static final String FROM = "Ledger <digest@example.test>";

  /** Records the call and answers with whatever the test supplies. */
  static class FakeResend implements ResendClient {
    int calls;
    String authorization;
    String idempotencyKey;
    ResendSendRequest body;
    Supplier<ResendSendResponse> answer =
        () -> {
          ResendSendResponse r = new ResendSendResponse();
          r.id = "re_123";
          return r;
        };

    @Override
    public ResendSendResponse send(
        String authorization, String idempotencyKey, ResendSendRequest body) {
      calls++;
      this.authorization = authorization;
      this.idempotencyKey = idempotencyKey;
      this.body = body;
      return answer.get();
    }
  }

  private final FakeResend resend = new FakeResend();

  private EmailService service(boolean enabled, String apiKey) {
    return new EmailService(
        resend, new ObjectMapper(), enabled, Optional.ofNullable(apiKey), FROM);
  }

  private Optional<String> sendOne(EmailService service) {
    return service.send("me@example.test", "Subject", "<p>html</p>", "text body", "key-1");
  }

  @Test
  void sendsThroughResendWhenEnabled() {
    Optional<String> id = sendOne(service(true, "re_secret"));

    assertEquals(Optional.of("re_123"), id);
    assertEquals(1, resend.calls);
    assertEquals("Bearer re_secret", resend.authorization);
    assertEquals("key-1", resend.idempotencyKey);
    assertEquals(FROM, resend.body.from);
    assertEquals(List.of("me@example.test"), resend.body.to);
    assertEquals("Subject", resend.body.subject);
    assertEquals("<p>html</p>", resend.body.html);
    assertEquals("text body", resend.body.text);
  }

  @Test
  void onlyLogsWhenDisabled() {
    Optional<String> id = sendOne(service(false, "re_secret"));

    assertTrue(id.isEmpty());
    assertEquals(0, resend.calls);
  }

  @Test
  void disabledNeedsNoApiKey() {
    assertTrue(sendOne(service(false, null)).isEmpty());
    assertEquals(0, resend.calls);
  }

  @Test
  void enabledWithoutApiKeyFailsWithoutCallingResend() {
    EmailSendException e =
        assertThrows(EmailSendException.class, () -> sendOne(service(true, "  ")));
    assertEquals(0, e.status());
    assertTrue(e.getMessage().contains("RESEND_API_KEY"), e.getMessage());
    assertEquals(0, resend.calls);
  }

  @Test
  void mapsResend4xxToTypedExceptionWithResendsMessage() {
    resend.answer =
        () -> {
          throw new WebApplicationException(
              Response.status(422)
                  .entity(
                      "{\"statusCode\":422,\"name\":\"validation_error\","
                          + "\"message\":\"Invalid `to` field.\"}")
                  .build());
        };

    EmailSendException e =
        assertThrows(EmailSendException.class, () -> sendOne(service(true, "re_secret")));
    assertEquals(422, e.status());
    assertEquals("Resend 422: Invalid `to` field.", e.getMessage());
    assertFalse(e.isRetryable());
  }

  @Test
  void mapsResend5xxAndKeepsNonJsonBodies() {
    resend.answer =
        () -> {
          throw new WebApplicationException(
              Response.status(502).entity("<html>Bad gateway</html>").build());
        };

    EmailSendException e =
        assertThrows(EmailSendException.class, () -> sendOne(service(true, "re_secret")));
    assertEquals(502, e.status());
    assertEquals("Resend 502: <html>Bad gateway</html>", e.getMessage());
    assertTrue(e.isRetryable());
  }

  @Test
  void rateLimitIsRetryable() {
    resend.answer =
        () -> {
          throw new WebApplicationException(
              Response.status(429).entity("{\"message\":\"Too many requests\"}").build());
        };

    EmailSendException e =
        assertThrows(EmailSendException.class, () -> sendOne(service(true, "re_secret")));
    assertEquals(429, e.status());
    assertTrue(e.isRetryable());
  }

  @Test
  void mapsConnectionFailures() {
    resend.answer =
        () -> {
          throw new ProcessingException("Connection refused");
        };

    EmailSendException e =
        assertThrows(EmailSendException.class, () -> sendOne(service(true, "re_secret")));
    assertEquals(0, e.status());
    assertTrue(e.isRetryable());
    assertTrue(e.getMessage().contains("Connection refused"), e.getMessage());
  }

  @Test
  void requiresAnIdempotencyKey() {
    EmailService service = service(true, "re_secret");
    assertThrows(
        IllegalArgumentException.class,
        () -> service.send("me@example.test", "Subject", "<p/>", "text", " "));
    assertEquals(0, resend.calls);
  }

  @Test
  void toleratesAnEmptySuccessBody() {
    resend.answer = () -> null;
    assertEquals(Optional.empty(), sendOne(service(true, "re_secret")));
    assertEquals(1, resend.calls);
  }
}
