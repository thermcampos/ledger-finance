package com.ledger.security;

import com.ledger.auth.dto.AuthResponse;
import com.ledger.user.User;
import io.smallrye.jwt.build.Jwt;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Duration;
import java.util.Set;

@ApplicationScoped
public class TokenService {

    public AuthResponse issueToken(User user) {
        String token = Jwt.issuer("https://ledger.app/issuer")
                .upn(user.email)
                .groups(Set.of("user"))
                .expiresIn(Duration.ofDays(7))
                .sign();
        return new AuthResponse(token, user.email, user.displayName);
    }
}
