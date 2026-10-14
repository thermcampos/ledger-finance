package com.ledger.security;

import io.quarkus.security.identity.request.TokenAuthenticationRequest;

public class ApiTokenAuthenticationRequest extends TokenAuthenticationRequest {

  public ApiTokenAuthenticationRequest(ApiTokenCredential credential) {
    super(credential);
  }
}
