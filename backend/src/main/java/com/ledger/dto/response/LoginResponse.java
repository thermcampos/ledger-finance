package com.ledger.dto.response;

/**
 * Answer to {@code POST /auth/login}. {@code status} discriminates: {@code AUTHENTICATED} carries
 * a real 7-day JWT in {@code token}; {@code TWO_FACTOR_REQUIRED} carries only a short-lived
 * {@code pendingToken} to exchange at {@code POST /auth/login/2fa} (ADR-0003).
 */
public record LoginResponse(
    String status, String token, String email, String displayName, String pendingToken) {

  public static LoginResponse authenticated(AuthResponse auth) {
    return new LoginResponse("AUTHENTICATED", auth.token(), auth.email(), auth.displayName(), null);
  }

  public static LoginResponse twoFactorRequired(String pendingToken) {
    return new LoginResponse("TWO_FACTOR_REQUIRED", null, null, null, pendingToken);
  }
}
