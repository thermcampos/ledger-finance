package com.ledger.transaction;

import com.ledger.account.Account;
import com.ledger.category.Category;
import com.ledger.security.CurrentUserService;
import com.ledger.user.User;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Path("/transactions")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class TransactionResource {

    @Inject
    CurrentUserService currentUser;

    @GET
    @Path("/account/{accountId}")
    public List<Transaction> listByAccount(@PathParam("accountId") Long accountId) {
        Account account = requireOwnedAccount(accountId);
        return Transaction.findByAccount(account.id);
    }

    @POST
    @Transactional
    public Transaction create(@Valid CreateTransactionRequest request) {
        Account account = requireOwnedAccount(request.accountId);

        Transaction txn = new Transaction();
        txn.account = account;
        txn.description = request.description;
        txn.amount = request.amount;
        txn.occurredOn = request.occurredOn != null ? request.occurredOn : LocalDate.now();

        if (request.categoryId != null) {
            txn.category = Category.findById(request.categoryId);
        }

        account.balance = account.balance.add(request.amount);
        txn.runningBalance = account.balance;

        txn.persist();
        return txn;
    }

    private Account requireOwnedAccount(Long accountId) {
        User user = currentUser.require();
        Account account = Account.findById(accountId);
        if (account == null || !account.user.id.equals(user.id)) {
            throw new NotFoundException("Account not found");
        }
        return account;
    }

    public static class CreateTransactionRequest {
        @NotNull
        public Long accountId;
        public Long categoryId;
        @NotBlank
        public String description;
        @NotNull
        public BigDecimal amount;
        public LocalDate occurredOn;
    }
}
