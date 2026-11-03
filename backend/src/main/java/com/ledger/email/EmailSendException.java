package com.ledger.email;

/**
 * A send that didn't reach a Resend 2xx. {@link #status()} is Resend's HTTP status, or {@code 0}
 * when there was no HTTP response (missing API key, connection failure). The message is Resend's
 * own {@code message} field when it sent one.
 */
public class EmailSendException extends RuntimeException {

  private final int status;

  public EmailSendException(int status, String message) {
    super(message);
    this.status = status;
  }

  public EmailSendException(String message, Throwable cause) {
    super(message, cause);
    this.status = 0;
  }

  public int status() {
    return status;
  }

  /** 429 and 5xx are worth retrying (with the same idempotency key); other 4xx are not. */
  public boolean isRetryable() {
    return status == 0 || status == 429 || status >= 500;
  }
}
