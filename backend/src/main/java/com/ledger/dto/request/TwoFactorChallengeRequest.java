package com.ledger.dto.request;

import com.ledger.service.TwoFactorService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Body of {@code POST /auth/login/2fa}: the pending-login token plus the second factor. */
public record TwoFactorChallengeRequest(
    @NotBlank String pendingToken,
    @NotBlank String code,
    @NotNull TwoFactorService.CodeType codeType) {}
