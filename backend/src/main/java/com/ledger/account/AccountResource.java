package com.ledger.account;

import com.ledger.security.CurrentUserService;
import com.ledger.user.User;
import io.quarkus.hibernate.orm.panache.Panache;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.persistence.PersistenceException;
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
        validateCreditCardFields(request.creditLimit, request.dueDayOfMonth);
        validatePaymentAccount(user, request.kind, request.paymentAccountId, null);

        Account account = new Account();
        account.user = user;
        account.name = request.name;
        account.institution = request.institution;
        account.kind = request.kind;
        account.balance = request.balance != null ? request.balance : BigDecimal.ZERO;
        account.openingBalance = account.balance;
        account.lastSyncedAt = Instant.now();
        account.creditLimit = request.creditLimit;
        account.dueDayOfMonth = request.dueDayOfMonth;
        account.paymentAccount = request.paymentAccountId != null ? Account.findById(request.paymentAccountId) : null;
        account.persist();
        return account;
    }

    @PUT
    @Path("/{id}")
    @Transactional
    public Account update(@PathParam("id") Long id, @Valid UpdateAccountRequest request) {
        User user = currentUser.require();
        Account account = Account.findById(id);
        if (account == null || !account.user.id.equals(user.id)) {
            throw new NotFoundException();
        }
        validateCreditCardFields(request.creditLimit, request.dueDayOfMonth);
        validatePaymentAccount(user, request.kind, request.paymentAccountId, id);
        account.name = request.name;
        account.institution = request.institution;
        account.kind = request.kind;
        account.creditLimit = request.creditLimit;
        account.dueDayOfMonth = request.dueDayOfMonth;
        account.paymentAccount = request.paymentAccountId != null ? Account.findById(request.paymentAccountId) : null;
        return account;
    }

    private void validateCreditCardFields(BigDecimal creditLimit, Integer dueDayOfMonth) {
        if (creditLimit != null && creditLimit.signum() < 0) {
            throw new WebApplicationException("Credit limit cannot be negative", 400);
        }
        if (dueDayOfMonth != null && (dueDayOfMonth < 1 || dueDayOfMonth > 31)) {
            throw new WebApplicationException("Due day must be between 1 and 31", 400);
        }
    }

    private void validatePaymentAccount(User user, AccountKind kind, Long paymentAccountId, Long selfId) {
        if (paymentAccountId == null) {
            return;
        }
        if (kind != AccountKind.CREDIT_CARD) {
            throw new WebApplicationException("Payment account can only be set on a credit card", 400);
        }
        if (paymentAccountId.equals(selfId)) {
            throw new WebApplicationException("A card cannot be its own payment account", 400);
        }
        Account target = Account.findById(paymentAccountId);
        if (target == null || !target.user.id.equals(user.id)) {
            throw new NotFoundException("Payment account not found");
        }
        if (target.kind != AccountKind.CHECKING && target.kind != AccountKind.SAVINGS) {
            throw new WebApplicationException("Payment account must be checking or savings", 400);
        }
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
        try {
            account.delete();
            Panache.flush();
        } catch (PersistenceException e) {
            throw new WebApplicationException("Cannot delete an account that still has transactions", 409);
        }
    }

    public static class CreateAccountRequest {
        @NotBlank
        public String name;
        public String institution;
        public AccountKind kind;
        public BigDecimal balance;
        public BigDecimal creditLimit;
        public Integer dueDayOfMonth;
        public Long paymentAccountId;
    }

    public static class UpdateAccountRequest {
        @NotBlank
        public String name;
        public String institution;
        public AccountKind kind;
        public BigDecimal creditLimit;
        public Integer dueDayOfMonth;
        public Long paymentAccountId;
    }
}
