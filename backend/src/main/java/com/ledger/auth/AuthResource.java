package com.ledger.auth;

import com.ledger.auth.dto.AuthResponse;
import com.ledger.auth.dto.LoginRequest;
import com.ledger.auth.dto.SignupRequest;
import com.ledger.user.User;
import io.quarkus.elytron.security.common.BcryptUtil;
import io.smallrye.jwt.build.Jwt;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.Duration;
import java.util.Set;

@Path("/auth")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AuthResource {

    @POST
    @Path("/signup")
    @Transactional
    public Response signup(@Valid SignupRequest request) {
        if (User.findByEmail(request.email) != null) {
            throw new WebApplicationException("An account with this email already exists", 409);
        }

        User user = new User();
        user.email = request.email;
        user.displayName = request.displayName;
        user.passwordHash = BcryptUtil.bcryptHash(request.password);
        user.persist();

        return Response.status(Response.Status.CREATED)
                .entity(issueToken(user))
                .build();
    }

    @POST
    @Path("/login")
    public Response login(@Valid LoginRequest request) {
        User user = User.findByEmail(request.email);
        if (user == null || !BcryptUtil.matches(request.password, user.passwordHash)) {
            throw new WebApplicationException("Invalid email or password", 401);
        }
        return Response.ok(issueToken(user)).build();
    }

    private AuthResponse issueToken(User user) {
        String token = Jwt.issuer("https://ledger.app/issuer")
                .upn(user.email)
                .groups(Set.of("user"))
                .expiresIn(Duration.ofDays(7))
                .sign();
        return new AuthResponse(token, user.email, user.displayName);
    }
}
