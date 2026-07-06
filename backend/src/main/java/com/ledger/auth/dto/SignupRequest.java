package com.ledger.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class SignupRequest {

    @Email
    @NotBlank
    public String email;

    @NotBlank
    @Size(min = 8, message = "Password must be at least 8 characters")
    public String password;

    @NotBlank
    public String displayName;
}
