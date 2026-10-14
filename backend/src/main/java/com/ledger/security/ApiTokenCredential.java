package com.ledger.security;

import io.quarkus.security.credential.TokenCredential;

public class ApiTokenCredential extends TokenCredential {

  public ApiTokenCredential(String token) {
    super(token, "ledger-api-token");
  }
}
