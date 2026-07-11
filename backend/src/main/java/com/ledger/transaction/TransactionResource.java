package com.ledger.transaction;

import com.ledger.account.Account;
import com.ledger.account.AccountKind;
import com.ledger.category.Category;
import com.ledger.security.CurrentUserService;
import com.ledger.user.User;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
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

    @Inject
    CreditCardBillSyncService billSync;

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
        String seriesId = count > 1 ? java.util.UUID.randomUUID().toString() : null;
        RepeatFrequency seriesRepeat = count > 1 ? repeat : null;

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
            txn.seriesId = seriesId;
            txn.seriesRepeat = seriesRepeat;
            txn.billDueDate = repeat == RepeatFrequency.NONE ? request.billDueDate : null;
            txn.persist();
            created.add(txn);
            date = advance(date, repeat);
        }

        billSync.recomputeAccountBalance(account);
        if (account.kind == AccountKind.CREDIT_CARD) {
            billSync.sync(account);
        }
        return created;
    }

    @POST
    @Path("/batch")
    @Transactional
    public List<Transaction> batchCreate(@Valid BatchImportRequest request) {
        Account account = requireOwnedAccount(request.accountId);
        if (account.kind == AccountKind.CREDIT_CARD && request.billDueDate == null) {
            throw new WebApplicationException("billDueDate required for credit card imports", 400);
        }
        LocalDate billDueDate = account.kind == AccountKind.CREDIT_CARD ? request.billDueDate : null;

        List<Transaction> created = new ArrayList<>();
        for (BatchRow row : request.rows) {
            Transaction txn = new Transaction();
            txn.account = account;
            txn.category = row.categoryId != null ? Category.findById(row.categoryId) : null;
            txn.description = row.description;
            txn.amount = row.amount;
            txn.occurredOn = row.occurredOn;
            txn.billDueDate = billDueDate;
            txn.persist();
            created.add(txn);
        }

        billSync.recomputeAccountBalance(account);
        if (account.kind == AccountKind.CREDIT_CARD) {
            billSync.sync(account);
        }
        return created;
    }

    @PUT
    @Path("/{id}")
    @Transactional
    public Transaction update(@PathParam("id") Long id, @Valid UpdateTransactionRequest request) {
        Transaction txn = requireOwnedTransaction(id);
        if (txn.linkedCard != null) {
            throw new WebApplicationException("Cannot directly edit a credit card bill transaction", 400);
        }

        EditScope scope = request.scope != null ? request.scope : EditScope.THIS;
        if (scope == EditScope.FUTURE && txn.seriesId != null) {
            applyToSeries(txn, request);
        } else {
            applyToSingle(txn, request);
        }

        billSync.recomputeAccountBalance(txn.account);
        if (txn.account.kind == AccountKind.CREDIT_CARD) {
            billSync.sync(txn.account);
        }
        return txn;
    }

    private void applyToSingle(Transaction txn, UpdateTransactionRequest request) {
        txn.description = request.description;
        txn.amount = request.amount;
        txn.occurredOn = request.occurredOn != null ? request.occurredOn : txn.occurredOn;
        txn.category = request.categoryId != null ? Category.findById(request.categoryId) : null;
        txn.billDueDate = request.billDueDate;
    }

    /**
     * "This and future": description/category/billDueDate propagate to every
     * row from the anchor onward. occurredOn is never propagated — only the
     * anchor's own date changes, and seriesFrom() uses the anchor's original
     * date, so moving it can't change which rows count as "future".
     */
    private void applyToSeries(Transaction anchor, UpdateTransactionRequest request) {
        List<Transaction> rest = seriesFrom(anchor);
        Category category = request.categoryId != null ? Category.findById(request.categoryId) : null;

        if (anchor.seriesRepeat == RepeatFrequency.INSTALLMENTS) {
            BigDecimal[] amounts = splitAmount(request.amount, RepeatFrequency.INSTALLMENTS, rest.size());
            for (int i = 0; i < rest.size(); i++) {
                Transaction t = rest.get(i);
                t.description = request.description;
                t.category = category;
                t.billDueDate = request.billDueDate;
                t.amount = amounts[i];
            }
        } else {
            for (Transaction t : rest) {
                t.description = request.description;
                t.category = category;
                t.billDueDate = request.billDueDate;
                t.amount = request.amount;
            }
        }

        anchor.occurredOn = request.occurredOn != null ? request.occurredOn : anchor.occurredOn;
    }

    /** This row and every row scheduled on/after it within the same series — occurredOn primary, id tie-break for same-day rows. */
    private List<Transaction> seriesFrom(Transaction anchor) {
        return Transaction.list(
                "seriesId = ?1 and (occurredOn > ?2 or (occurredOn = ?2 and id >= ?3))",
                io.quarkus.panache.common.Sort.ascending("occurredOn").and("id"),
                anchor.seriesId, anchor.occurredOn, anchor.id);
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    public void delete(@PathParam("id") Long id, @QueryParam("scope") @DefaultValue("THIS") EditScope scope) {
        Transaction txn = requireOwnedTransaction(id);
        if (txn.linkedCard != null) {
            throw new WebApplicationException("Cannot directly delete a credit card bill transaction", 400);
        }
        Account account = txn.account;
        String seriesId = txn.seriesId;

        if (scope == EditScope.FUTURE && seriesId != null) {
            for (Transaction t : seriesFrom(txn)) {
                t.delete();
            }
        } else {
            txn.delete();
        }

        if (seriesId != null) {
            renumberSeries(seriesId);
        }

        billSync.recomputeAccountBalance(account);
        if (account.kind == AccountKind.CREDIT_CARD) {
            billSync.sync(account);
        }
    }

    /**
     * Keeps seriesInfo contiguous after any delete (single-row or "this and
     * future" batch): e.g. 1/12,2/12,4/12,5/12... becomes 1/11,2/11,3/11...
     * A series collapsed down to one remaining row is no longer meaningfully
     * a series — clear its series fields so it falls back to plain
     * single-row edit/delete and drops the seriesInfo badge.
     */
    private void renumberSeries(String seriesId) {
        List<Transaction> remaining = Transaction.findBySeries(seriesId);
        if (remaining.isEmpty()) {
            return;
        }
        if (remaining.size() == 1) {
            Transaction only = remaining.get(0);
            only.seriesInfo = null;
            only.seriesId = null;
            only.seriesRepeat = null;
            return;
        }
        int total = remaining.size();
        for (int i = 0; i < total; i++) {
            remaining.get(i).seriesInfo = (i + 1) + "/" + total;
        }
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

    public static class BatchImportRequest {
        @NotNull
        public Long accountId;
        /** Required when the target account is a credit card — one bill for the whole batch, not per-row. */
        public LocalDate billDueDate;
        @NotEmpty
        @Valid
        public List<BatchRow> rows;
    }

    public static class BatchRow {
        public Long categoryId;
        @NotBlank
        public String description;
        @NotNull
        public BigDecimal amount;
        @NotNull
        public LocalDate occurredOn;
    }

    public static class UpdateTransactionRequest {
        public Long categoryId;
        @NotBlank
        public String description;
        @NotNull
        public BigDecimal amount;
        public LocalDate occurredOn;
        public LocalDate billDueDate;
        /** THIS (default when omitted) or FUTURE. FUTURE is only honored when the target transaction has a non-null seriesId — see TransactionResource#update. */
        public EditScope scope;
    }
}
