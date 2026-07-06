package com.ledger.auth.dto;

public class AuthResponse {

    public String token;
    public String email;
    public String displayName;

    public AuthResponse(String token, String email, String displayName) {
        this.token = token;
        this.email = email;
        this.displayName = displayName;
    }
}
