package com.ledger.email;

/**
 * Data for the security-event email (2FA enabled/disabled, recovery codes regenerated, a recovery
 * code consumed) — one parameterized template pair instead of four near-identical ones. {@code
 * detail} explains what happened and what to do if it wasn't you.
 */
public record SecurityEventEmail(String title, String preheader, String detail, String profileUrl) {

  public String subject() {
    return "Ledger · " + title;
  }
}
