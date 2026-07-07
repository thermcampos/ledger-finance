package com.ledger.transaction;

import com.ledger.account.Account;
import com.ledger.category.Category;
import com.ledger.security.CurrentUserService;
import com.ledger.user.User;
import io.quarkus.panache.common.Sort;
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

        txn.persist();
        recomputeAccountBalance(account);
        return txn;
    }

    @PUT
    @Path("/{id}")
    @Transactional
    public Transaction update(@PathParam("id") Long id, @Valid UpdateTransactionRequest request) {
        Transaction txn = requireOwnedTransaction(id);

        txn.description = request.description;
        txn.amount = request.amount;
        txn.occurredOn = request.occurredOn != null ? request.occurredOn : txn.occurredOn;
        txn.category = request.categoryId != null ? Category.findById(request.categoryId) : null;

        recomputeAccountBalance(txn.account);
        return txn;
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    public void delete(@PathParam("id") Long id) {
        Transaction txn = requireOwnedTransaction(id);
        Account account = txn.account;
        txn.delete();
        recomputeAccountBalance(account);
    }

    private Account requireOwnedAccount(Long accountId) {
        User user = currentUser.require();
        Account account = Account.findById(accountId);
        if (account == null || !account.user.id.equals(user.id)) {
            throw new NotFoundException("Account not found");
        }
        return account;
    }

    private Transaction requireOwnedTransaction(Long id) {
        User user = currentUser.require();
        Transaction txn = Transaction.findById(id);
        if (txn == null || !txn.account.user.id.equals(user.id)) {
            throw new NotFoundException("Transaction not found");
        }
        return txn;
    }

    /**
     * Re-derives account.balance and every transaction's runningBalance from
     * account.openingBalance, walking transactions in chronological
     * (occurredOn, then id) order rather than insertion order — so a
     * backdated create, an edited amount/date, or a delete all leave a
     * consistent ledger regardless of when each row was originally entered.
     */
    private void recomputeAccountBalance(Account account) {
        List<Transaction> txns = Transaction.list(
                "account.id", Sort.ascending("occurredOn").and("id"), account.id);
        BigDecimal running = account.openingBalance;
        for (Transaction t : txns) {
            running = running.add(t.amount);
            t.runningBalance = running;
        }
        account.balance = running;
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

    public static class UpdateTransactionRequest {
        public Long categoryId;
        @NotBlank
        public String description;
        @NotNull
        public BigDecimal amount;
        public LocalDate occurredOn;
    }
}
