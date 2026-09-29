package com.ledger.resource;

import com.ledger.entity.Account;
import com.ledger.entity.Category;
import com.ledger.entity.CreditCardBill;
import com.ledger.entity.Transaction;
import com.ledger.enums.AccountKind;
import com.ledger.enums.EditScope;
import com.ledger.enums.RepeatFrequency;
import com.ledger.security.CurrentUserService;
import com.ledger.service.BudgetProjectionSyncService;
import com.ledger.service.CreditCardBillSyncService;
import com.ledger.entity.User;
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
import java.util.Objects;

@Path("/transactions")
@RolesAllowed("user")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class TransactionResource {

  @Inject CurrentUserService currentUser;

  @Inject CreditCardBillSyncService billSync;

  @Inject BudgetProjectionSyncService budgetSync;

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
    LocalDate date = request.occurredOn != null ? request.occurredOn : LocalDate.now();
    Integer offsetMonths = billOffsetMonths(account, date, request.billDueDate);

    List<Transaction> created = new ArrayList<>();
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
      txn.billDueDate =
          offsetMonths != null ? shiftedBillDueDate(account, date, offsetMonths) : null;
      txn.completed = request.completed;
      txn.debitAuthorized = request.debitAuthorized;
      assertNotPaidBill(account, txn);
      txn.persist();
      created.add(txn);
      date = advance(date, repeat);
    }

    billSync.recomputeAccountBalance(account);
    // Budget projections re-derive before the card bill sync so a projection
    // landing on a card is already in place when the card's bill is recomputed.
    if (category != null) {
      budgetSync.syncForCategory(currentUser.require(), category.id);
    }
    if (account.kind == AccountKind.CREDIT_CARD) {
      billSync.sync(account);
    }
    return created;
  }

  @POST
  @Path("/transfer")
  @Transactional
  public List<Transaction> createTransfer(@Valid CreateTransferRequest request) {
    Account source = requireOwnedAccount(request.sourceAccountId);
    Account target = requireOwnedAccount(request.targetAccountId);
    if (source.id.equals(target.id)) {
      throw new WebApplicationException("Source and target account must differ", 400);
    }
    if (source.kind == AccountKind.CREDIT_CARD || target.kind == AccountKind.CREDIT_CARD) {
      throw new WebApplicationException("Credit card accounts cannot be used in a transfer", 400);
    }
    if (request.amount.signum() <= 0) {
      throw new WebApplicationException("Amount must be positive", 400);
    }
    Category transferCategory = findOrCreateTransferCategory();
    LocalDate date = request.occurredOn != null ? request.occurredOn : LocalDate.now();

    Transaction sourceTxn = new Transaction();
    sourceTxn.account = source;
    sourceTxn.category = transferCategory;
    sourceTxn.description = request.description;
    sourceTxn.amount = request.amount.negate();
    sourceTxn.occurredOn = date;
    sourceTxn.completed = request.completed;
    sourceTxn.debitAuthorized = request.debitAuthorized;
    sourceTxn.persist();

    Transaction targetTxn = new Transaction();
    targetTxn.account = target;
    targetTxn.category = transferCategory;
    targetTxn.description = request.description;
    targetTxn.amount = request.amount;
    targetTxn.occurredOn = date;
    targetTxn.completed = request.completed;
    targetTxn.debitAuthorized = request.debitAuthorized;
    targetTxn.transferPeer = sourceTxn;
    targetTxn.persist();

    sourceTxn.transferPeer = targetTxn;

    billSync.recomputeAccountBalance(source);
    billSync.recomputeAccountBalance(target);
    return List.of(sourceTxn, targetTxn);
  }

  /**
   * Every user gets their own "Transfer" category lazily, on first transfer — categories aren't a
   * global/system table in this app.
   */
  private Category findOrCreateTransferCategory() {
    User user = currentUser.require();
    Category existing =
        Category.find("user.id = ?1 and name = ?2", user.id, "Transfer").firstResult();
    if (existing != null) {
      return existing;
    }
    Category category = new Category();
    category.user = user;
    category.name = "Transfer";
    category.colorHex = "#8B92A0";
    category.icon = "bi-arrow-left-right";
    category.persist();
    return category;
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

    if (account.kind == AccountKind.CREDIT_CARD) {
      assertNotPaidBill(account, billDueDate);
    }

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
    java.util.Set<Long> categoryIds = new java.util.HashSet<>();
    for (Transaction t : created) {
      if (t.category != null) {
        categoryIds.add(t.category.id);
      }
    }
    for (Long categoryId : categoryIds) {
      budgetSync.syncForCategory(currentUser.require(), categoryId);
    }
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
    if (txn.linkedBudget != null) {
      throw new WebApplicationException("Cannot directly edit a budget projection transaction", 400);
    }
    if (txn.transferPeer != null) {
      applyToTransfer(txn, request);
      billSync.recomputeAccountBalance(txn.account);
      billSync.recomputeAccountBalance(txn.transferPeer.account);
      return txn;
    }

    CreditCardBill paidBill = CreditCardBill.findByPaymentTransactionId(txn.id);
    if (paidBill != null) {
      return updatePaymentTransaction(txn, request, paidBill);
    }

    EditScope scope = request.scope != null ? request.scope : EditScope.THIS;
    Long oldCategoryId = txn.category != null ? txn.category.id : null;
    if (scope == EditScope.FUTURE && txn.seriesId != null) {
      applyToSeries(txn, request);
    } else {
      applyToSingle(txn, request);
    }

    billSync.recomputeAccountBalance(txn.account);
    // A re-categorization moves spend between budgets — sync both sides.
    budgetSync.syncForCategory(currentUser.require(), oldCategoryId);
    Long newCategoryId = txn.category != null ? txn.category.id : null;
    if (!Objects.equals(oldCategoryId, newCategoryId)) {
      budgetSync.syncForCategory(currentUser.require(), newCategoryId);
    }
    if (txn.account.kind == AccountKind.CREDIT_CARD) {
      billSync.sync(txn.account);
    }
    return txn;
  }

  private void applyToSingle(Transaction txn, UpdateTransactionRequest request) {
    if (txn.account.kind == AccountKind.CREDIT_CARD) {
      assertNotPaidBillForEdit(txn, request);
    }

    txn.description = request.description;
    txn.amount = request.amount;
    txn.occurredOn = request.occurredOn != null ? request.occurredOn : txn.occurredOn;
    txn.category = request.categoryId != null ? Category.findById(request.categoryId) : null;
    txn.billDueDate = request.billDueDate;
    txn.completed = request.completed;
    txn.debitAuthorized = request.debitAuthorized;
  }

  /**
   * Transfer rows are edited on either side and mirror to the other — category is fixed
   * ("Transfer") and there's no series, so only description/date/amount apply. request.amount is
   * always the positive magnitude; sign is re-derived per row from its existing sign so editing
   * from the target side doesn't need to know it must negate.
   */
  private void applyToTransfer(Transaction txn, UpdateTransactionRequest request) {
    Transaction peer = txn.transferPeer;
    LocalDate date = request.occurredOn != null ? request.occurredOn : txn.occurredOn;
    BigDecimal magnitude = request.amount.abs();

    txn.description = request.description;
    txn.occurredOn = date;
    txn.amount = txn.amount.signum() < 0 ? magnitude.negate() : magnitude;

    peer.description = request.description;
    peer.occurredOn = date;
    peer.amount = peer.amount.signum() < 0 ? magnitude.negate() : magnitude;
    txn.completed = request.completed;
    txn.debitAuthorized = request.debitAuthorized;
    peer.completed = request.completed;
    peer.debitAuthorized = request.debitAuthorized;
  }

  /**
   * "This and future": description/category/billDueDate propagate to every row from the anchor
   * onward. occurredOn is never propagated — only the anchor's own date changes, and seriesFrom()
   * uses the anchor's original date, so moving it can't change which rows count as "future".
   */
  private void applyToSeries(Transaction anchor, UpdateTransactionRequest request) {
    List<Transaction> rest = seriesFrom(anchor);
    if (anchor.account.kind == AccountKind.CREDIT_CARD) {
      for (Transaction t : rest) {
        LocalDate due = effectiveBillDueDate(anchor.account, t);
        assertNotPaidBill(anchor.account, due);
      }
      if (request.billDueDate != null && isPaidBill(anchor.account, request.billDueDate)) {
        throw new WebApplicationException(
            "This bill has already been paid. Delete the payment to edit this transaction.", 400);
      }
    }

    Category category = request.categoryId != null ? Category.findById(request.categoryId) : null;
    Integer offsetMonths = billOffsetMonths(anchor.account, anchor.occurredOn, request.billDueDate);

    if (anchor.seriesRepeat == RepeatFrequency.INSTALLMENTS) {
      BigDecimal[] amounts = splitAmount(request.amount, RepeatFrequency.INSTALLMENTS, rest.size());
      for (int i = 0; i < rest.size(); i++) {
        Transaction t = rest.get(i);
        t.description = request.description;
        t.category = category;
        t.billDueDate =
            offsetMonths != null ? shiftedBillDueDate(t.account, t.occurredOn, offsetMonths) : null;
        t.amount = amounts[i];
        t.completed = request.completed;
        t.debitAuthorized = request.debitAuthorized;
      }
    } else {
      for (Transaction t : rest) {
        t.description = request.description;
        t.category = category;
        t.billDueDate =
            offsetMonths != null ? shiftedBillDueDate(t.account, t.occurredOn, offsetMonths) : null;
        t.amount = request.amount;
        t.completed = request.completed;
        t.debitAuthorized = request.debitAuthorized;
      }
    }

    anchor.occurredOn = request.occurredOn != null ? request.occurredOn : anchor.occurredOn;
    anchor.completed = request.completed;
    anchor.debitAuthorized = request.debitAuthorized;
  }

  /**
   * Number of calendar months between an occurrence's natural bill and a genuinely overridden bill
   * choice, anchored at occurredOn — e.g. picking "next bill" instead of the natural one yields +1.
   * Null when there's no override to apply (no dueDayOfMonth, or no billDueDate sent). Reused so
   * every occurrence in a repeat/installment series shifts by the same number of bill cycles as the
   * anchor's own override, instead of every row landing on one identical explicit date.
   */
  private Integer billOffsetMonths(
      Account account, LocalDate occurredOn, LocalDate requestedBillDueDate) {
    if (account.dueDayOfMonth == null || requestedBillDueDate == null) {
      return null;
    }
    LocalDate naturalBill = billSync.nextDueDate(account.dueDayOfMonth, occurredOn);
    return (requestedBillDueDate.getYear() * 12 + requestedBillDueDate.getMonthValue())
        - (naturalBill.getYear() * 12 + naturalBill.getMonthValue());
  }

  /**
   * This occurrence's own natural bill, shifted forward by offsetMonths bill cycles (clamped for
   * short months).
   */
  private LocalDate shiftedBillDueDate(Account account, LocalDate occurredOn, int offsetMonths) {
    LocalDate naturalBill = billSync.nextDueDate(account.dueDayOfMonth, occurredOn);
    LocalDate shiftedMonth = naturalBill.plusMonths(offsetMonths);
    return shiftedMonth.withDayOfMonth(
        Math.min(account.dueDayOfMonth, shiftedMonth.lengthOfMonth()));
  }

  /**
   * This row and every row scheduled on/after it within the same series — occurredOn primary, id
   * tie-break for same-day rows.
   */
  private List<Transaction> seriesFrom(Transaction anchor) {
    return Transaction.list(
        "seriesId = ?1 and (occurredOn > ?2 or (occurredOn = ?2 and id >= ?3))",
        io.quarkus.panache.common.Sort.ascending("occurredOn").and("id"),
        anchor.seriesId,
        anchor.occurredOn,
        anchor.id);
  }

  @DELETE
  @Path("/{id}")
  @Transactional
  public void delete(
      @PathParam("id") Long id, @QueryParam("scope") @DefaultValue("THIS") EditScope scope) {
    Transaction txn = requireOwnedTransaction(id);
    if (txn.linkedCard != null) {
      throw new WebApplicationException(
          "Cannot directly delete a credit card bill transaction", 400);
    }
    if (txn.linkedBudget != null) {
      throw new WebApplicationException(
          "Cannot directly delete a budget projection transaction", 400);
    }

    CreditCardBill paidBill = CreditCardBill.findByPaymentTransactionId(txn.id);
    if (paidBill != null) {
      unpayBill(paidBill);
      return;
    }

    if (txn.account.kind == AccountKind.CREDIT_CARD) {
      if (scope == EditScope.FUTURE && txn.seriesId != null) {
        for (Transaction t : seriesFrom(txn)) {
          assertNotPaidBill(t.account, effectiveBillDueDate(t.account, t));
        }
      } else {
        assertNotPaidBill(txn.account, effectiveBillDueDate(txn.account, txn));
      }
    }

    if (txn.transferPeer != null) {
      Transaction peer = txn.transferPeer;
      Account account = txn.account;
      Account peerAccount = peer.account;
      // Break the mutual FK reference before deleting either row —
      // Hibernate flushes pending updates before deletes, so this
      // avoids a self-referential FK violation on transfer_peer_id.
      txn.transferPeer = null;
      peer.transferPeer = null;
      txn.delete();
      peer.delete();
      billSync.recomputeAccountBalance(account);
      billSync.recomputeAccountBalance(peerAccount);
      return;
    }
    Account account = txn.account;
    String seriesId = txn.seriesId;
    Long deletedCategoryId = txn.category != null ? txn.category.id : null;

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
    budgetSync.syncForCategory(currentUser.require(), deletedCategoryId);
    if (account.kind == AccountKind.CREDIT_CARD) {
      billSync.sync(account);
    }
  }

  /**
   * Keeps seriesInfo contiguous after any delete (single-row or "this and future" batch): e.g.
   * 1/12,2/12,4/12,5/12... becomes 1/11,2/11,3/11... A series collapsed down to one remaining row
   * is no longer meaningfully a series — clear its series fields so it falls back to plain
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

  private void assertNotPaidBill(Account account, Transaction txn) {
    if (account.kind != AccountKind.CREDIT_CARD || account.dueDayOfMonth == null) {
      return;
    }
    LocalDate dueDate =
        txn.billDueDate != null
            ? txn.billDueDate
            : billSync.nextDueDate(account.dueDayOfMonth, txn.occurredOn);
    assertNotPaidBill(account, dueDate);
  }

  private void assertNotPaidBill(Account account, LocalDate dueDate) {
    if (dueDate == null || account.kind != AccountKind.CREDIT_CARD) {
      return;
    }
    if (isPaidBill(account, dueDate)) {
      throw new WebApplicationException(
          "This bill has already been paid. Delete the payment to add more transactions.", 400);
    }
  }

  private boolean isPaidBill(Account card, LocalDate dueDate) {
    CreditCardBill bill = CreditCardBill.findByAccountAndDueDate(card.id, dueDate);
    return bill != null && bill.paid;
  }

  private LocalDate effectiveBillDueDate(Account account, Transaction txn) {
    if (account.dueDayOfMonth == null) {
      return txn.billDueDate;
    }
    return txn.billDueDate != null
        ? txn.billDueDate
        : billSync.nextDueDate(account.dueDayOfMonth, txn.occurredOn);
  }

  private void assertNotPaidBillForEdit(Transaction txn, UpdateTransactionRequest request) {
    LocalDate oldDue = effectiveBillDueDate(txn.account, txn);
    LocalDate newDue =
        request.billDueDate != null
            ? request.billDueDate
            : (request.occurredOn != null && txn.account.dueDayOfMonth != null
                ? billSync.nextDueDate(txn.account.dueDayOfMonth, request.occurredOn)
                : oldDue);
    boolean changesBill =
        !Objects.equals(txn.amount, request.amount)
            || !Objects.equals(txn.occurredOn, request.occurredOn)
            || !Objects.equals(txn.billDueDate, request.billDueDate);
    if (changesBill && (isPaidBill(txn.account, oldDue) || isPaidBill(txn.account, newDue))) {
      throw new WebApplicationException(
          "This bill has already been paid. Delete the payment to edit this transaction.", 400);
    }
  }

  private Transaction updatePaymentTransaction(
      Transaction txn, UpdateTransactionRequest request, CreditCardBill bill) {
    Long currentCategoryId = txn.category != null ? txn.category.id : null;
    if (!Objects.equals(txn.amount, request.amount)
        || !Objects.equals(currentCategoryId, request.categoryId)
        || !Objects.equals(txn.description, request.description)) {
      throw new WebApplicationException(
          "Credit card payment transactions can only have their date and flags changed", 400);
    }

    if (request.occurredOn != null) {
      txn.occurredOn = request.occurredOn;
      bill.paymentDate = request.occurredOn;
    }
    txn.completed = request.completed;
    txn.debitAuthorized = request.debitAuthorized;

    billSync.recomputeAccountBalance(txn.account);
    return txn;
  }

  private void unpayBill(CreditCardBill bill) {
    Transaction payment = bill.paymentTransaction;
    Account paymentAccount = bill.paymentAccount;
    Account card = bill.account;

    bill.paid = false;
    bill.paymentDate = null;
    bill.paymentAccount = null;
    bill.paymentTransaction = null;

    if (payment != null) {
      payment.delete();
    }

    if (paymentAccount != null) {
      billSync.recomputeAccountBalance(paymentAccount);
    }
    billSync.sync(card);
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
   * WEEKLY/MONTHLY/YEARLY repeat the same amount each occurrence. INSTALLMENTS splits the total
   * evenly instead, putting any rounding remainder on the last installment so the parts always sum
   * back to the original amount exactly.
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
    @NotNull public Long accountId;
    public Long categoryId;
    @NotBlank public String description;
    @NotNull public BigDecimal amount;
    public LocalDate occurredOn;

    /** NONE (or omitted) for a one-off transaction. */
    public RepeatFrequency repeat;

    /** Required (2-60) when repeat is not NONE. */
    public Integer occurrences;

    /**
     * A genuine override of the natural bill for the first occurrence (e.g. the statement already
     * closed before occurredOn). For a repeat/installment batch, every later occurrence's own
     * natural bill shifts by the same number of bill cycles — see
     * TransactionResource#billOffsetMonths.
     */
    public LocalDate billDueDate;

    public Boolean completed;

    public Boolean debitAuthorized;
  }

  public static class CreateTransferRequest {
    @NotNull public Long sourceAccountId;
    @NotNull public Long targetAccountId;
    @NotBlank public String description;

    /**
     * Always positive — the magnitude moved. Sign is derived per-row (negative on source, positive
     * on target).
     */
    @NotNull public BigDecimal amount;

    public LocalDate occurredOn;

    public Boolean completed;

    public Boolean debitAuthorized;
  }

  public static class BatchImportRequest {
    @NotNull public Long accountId;

    /**
     * Required when the target account is a credit card — one bill for the whole batch, not
     * per-row.
     */
    public LocalDate billDueDate;

    @NotEmpty @Valid public List<BatchRow> rows;
  }

  public static class BatchRow {
    public Long categoryId;
    @NotBlank public String description;
    @NotNull public BigDecimal amount;
    @NotNull public LocalDate occurredOn;
  }

  public static class UpdateTransactionRequest {
    public Long categoryId;
    @NotBlank public String description;
    @NotNull public BigDecimal amount;
    public LocalDate occurredOn;
    public LocalDate billDueDate;

    public Boolean completed;

    public Boolean debitAuthorized;

    /**
     * THIS (default when omitted) or FUTURE. FUTURE is only honored when the target transaction has
     * a non-null seriesId — see TransactionResource#update.
     */
    public EditScope scope;
  }
}
