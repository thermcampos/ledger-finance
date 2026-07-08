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
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
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
    public List<Transaction> create(@Valid CreateTransactionRequest request) {
        Account account = requireOwnedAccount(request.accountId);
        Category category = request.categoryId != null ? Category.findById(request.categoryId) : null;

        RepeatFrequency repeat = request.repeat != null ? request.repeat : RepeatFrequency.NONE;
        int count = repeat == RepeatFrequency.NONE ? 1 : requireOccurrences(request.occurrences);
        BigDecimal[] amounts = splitAmount(request.amount, repeat, count);

        List<Transaction> created = new ArrayList<>();
        LocalDate date = request.occurredOn != null ? request.occurredOn : LocalDate.now();
        for (int i = 0; i < count; i++) {
            Transaction txn = new Transaction();
            txn.account = account;
            txn.category = category;
            txn.description = request.description;
            txn.amount = amounts[i];
            txn.occurredOn = date;
            txn.seriesInfo = count > 1 ? (i + 1) + "/" + count : null;
            txn.billDueDate = repeat == RepeatFrequency.NONE ? request.billDueDate : null;
            txn.persist();
            created.add(txn);
            date = advance(date, repeat);
        }

        recomputeAccountBalance(account);
        return created;
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
        txn.billDueDate = request.billDueDate;

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

    private int requireOccurrences(Integer occurrences) {
        if (occurrences == null || occurrences < 2 || occurrences > 60) {
            throw new WebApplicationException("Occurrences must be between 2 and 60", 400);
        }
        return occurrences;
    }

    private LocalDate advance(LocalDate date, RepeatFrequency repeat) {
        return switch (repeat) {
            case WEEKLY -> date.plusWeeks(1);
            case YEARLY -> date.plusYears(1);
            case MONTHLY, INSTALLMENTS -> date.plusMonths(1);
            default -> date;
        };
    }

    /**
     * WEEKLY/MONTHLY/YEARLY repeat the same amount each occurrence.
     * INSTALLMENTS splits the total evenly instead, putting any rounding
     * remainder on the last installment so the parts always sum back to the
     * original amount exactly.
     */
    private BigDecimal[] splitAmount(BigDecimal total, RepeatFrequency repeat, int count) {
        BigDecimal[] amounts = new BigDecimal[count];
        if (repeat != RepeatFrequency.INSTALLMENTS) {
            Arrays.fill(amounts, total);
            return amounts;
        }
        BigDecimal share = total.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
        BigDecimal runningSum = BigDecimal.ZERO;
        for (int i = 0; i < count - 1; i++) {
            amounts[i] = share;
            runningSum = runningSum.add(share);
        }
        amounts[count - 1] = total.subtract(runningSum);
        return amounts;
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
        /** NONE (or omitted) for a one-off transaction. */
        public RepeatFrequency repeat;
        /** Required (2-60) when repeat is not NONE. */
        public Integer occurrences;
        /** Only applied when repeat is NONE — see TransactionResource#create. */
        public LocalDate billDueDate;
    }

    public static class UpdateTransactionRequest {
        public Long categoryId;
        @NotBlank
        public String description;
        @NotNull
        public BigDecimal amount;
        public LocalDate occurredOn;
        public LocalDate billDueDate;
    }
}
