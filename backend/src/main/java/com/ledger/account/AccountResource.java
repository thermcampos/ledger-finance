package com.ledger.account;

import com.ledger.security.CurrentUserService;
import com.ledger.user.User;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Path("/accounts")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AccountResource {

    @Inject
    CurrentUserService currentUser;

    @GET
    public List<Account> list() {
        User user = currentUser.require();
        return Account.findByUser(user.id);
    }

    @POST
    @Transactional
    public Account create(@Valid CreateAccountRequest request) {
        User user = currentUser.require();

        Account account = new Account();
        account.user = user;
        account.name = request.name;
        account.institution = request.institution;
        account.kind = request.kind;
        account.balance = request.balance != null ? request.balance : BigDecimal.ZERO;
        account.lastSyncedAt = Instant.now();
        account.persist();
        return account;
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    public void delete(@PathParam("id") Long id) {
        User user = currentUser.require();
        Account account = Account.findById(id);
        if (account == null || !account.user.id.equals(user.id)) {
            throw new NotFoundException();
        }
        account.delete();
    }

    public static class CreateAccountRequest {
        @NotBlank
        public String name;
        public String institution;
        public AccountKind kind;
        public BigDecimal balance;
    }
}
