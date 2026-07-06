package com.ledger.auth.dto;

import jakarta.validation.constraints.NotBlank;

public class LoginRequest {

    @NotBlank
    public String email;

    @NotBlank
    public String password;
}
