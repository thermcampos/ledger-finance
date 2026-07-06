package com.ledger.security;

import com.ledger.user.User;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.NotAuthorizedException;
import org.eclipse.microprofile.jwt.JsonWebToken;

@RequestScoped
public class CurrentUserService {

    @Inject
    JsonWebToken jwt;

    /** Resolves the User row matching the authenticated principal, or throws 401. */
    public User require() {
        String email = jwt.getName();
        User user = User.findByEmail(email);
        if (user == null) {
            throw new NotAuthorizedException("User not found for token subject");
        }
        return user;
    }
}
