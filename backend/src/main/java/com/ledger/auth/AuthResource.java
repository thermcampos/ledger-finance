package com.ledger.auth;

import com.ledger.auth.dto.LoginRequest;
import com.ledger.auth.dto.SignupRequest;
import com.ledger.security.TokenService;
import com.ledger.user.User;
import io.quarkus.elytron.security.common.BcryptUtil;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.Instant;

@Path("/auth")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AuthResource {

    @Inject
    TokenService tokenService;

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
        user.createdAt = Instant.now();
        user.persist();

        return Response.status(Response.Status.CREATED)
                .entity(tokenService.issueToken(user))
                .build();
    }

    @POST
    @Path("/login")
    public Response login(@Valid LoginRequest request) {
        User user = User.findByEmail(request.email);
        if (user == null || !BcryptUtil.matches(request.password, user.passwordHash)) {
            throw new WebApplicationException("Invalid email or password", 401);
        }
        return Response.ok(tokenService.issueToken(user)).build();
    }
}
