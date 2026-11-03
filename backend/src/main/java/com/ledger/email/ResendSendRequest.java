package com.ledger.email;

import java.util.List;

/** Minimal request shape for Resend's POST /emails — only the fields Ledger sends. */
public class ResendSendRequest {

  public String from;
  public List<String> to;
  public String subject;
  public String html;
  public String text;

  public ResendSendRequest() {}

  public ResendSendRequest(String from, List<String> to, String subject, String html, String text) {
    this.from = from;
    this.to = to;
    this.subject = subject;
    this.html = html;
    this.text = text;
  }
}
