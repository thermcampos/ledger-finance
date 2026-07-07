package com.ledger.user;

import com.ledger.auth.dto.AuthResponse;
import com.ledger.security.CurrentUserService;
import com.ledger.security.TokenService;
import io.quarkus.elytron.security.common.BcryptUtil;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.time.Instant;
import java.util.List;

@Path("/users")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class UserResource {

    @Inject
    CurrentUserService currentUser;

    @Inject
    TokenService tokenService;

    @PUT
    @Path("/me")
    @Transactional
    public AuthResponse updateProfile(@Valid UpdateProfileRequest request) {
        User user = currentUser.require();

        if (!request.email.equalsIgnoreCase(user.email) && User.findByEmail(request.email) != null) {
            throw new WebApplicationException("An account with this email already exists", 409);
        }

        if (!request.displayName.equals(user.displayName)) {
            recordHistory(user, AccountHistoryField.DISPLAY_NAME, user.displayName, request.displayName);
        }
        if (!request.email.equalsIgnoreCase(user.email)) {
            recordHistory(user, AccountHistoryField.EMAIL, user.email, request.email);
        }

        user.email = request.email;
        user.displayName = request.displayName;

        // Re-issue the token: the JWT's principal is the email, so a changed
        // email would otherwise 401 the very next request under the old token.
        return tokenService.issueToken(user);
    }

    @PUT
    @Path("/me/password")
    @Transactional
    public void changePassword(@Valid ChangePasswordRequest request) {
        User user = currentUser.require();
        if (!BcryptUtil.matches(request.currentPassword, user.passwordHash)) {
            // 400, not 401: the user IS authenticated here, this is a validation
            // failure of the request body — a 401 would trip the frontend's
            // global "session expired" interceptor and force an unwanted logout.
            throw new WebApplicationException("Current password is incorrect", 400);
        }
        user.passwordHash = BcryptUtil.bcryptHash(request.newPassword);
        recordHistory(user, AccountHistoryField.PASSWORD, null, null);
    }

    @GET
    @Path("/me/history")
    public List<AccountHistoryEntry> history() {
        User user = currentUser.require();
        return AccountHistoryEntry.findByUser(user.id);
    }

    private void recordHistory(User user, AccountHistoryField field, String oldValue, String newValue) {
        AccountHistoryEntry entry = new AccountHistoryEntry();
        entry.user = user;
        entry.field = field;
        entry.oldValue = oldValue;
        entry.newValue = newValue;
        entry.changedAt = Instant.now();
        entry.persist();
    }

    public static class UpdateProfileRequest {
        @Email
        @NotBlank
        public String email;
        @NotBlank
        public String displayName;
    }

    public static class ChangePasswordRequest {
        @NotBlank
        public String currentPassword;
        @NotBlank
        @Size(min = 8, message = "Password must be at least 8 characters")
        public String newPassword;
    }
}
