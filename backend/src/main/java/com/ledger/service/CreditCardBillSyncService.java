package com.ledger.service;

import com.ledger.entity.Account;
import com.ledger.entity.Transaction;
import com.ledger.enums.AccountKind;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Keeps a credit card's upcoming bills mirrored as real, system-generated Transaction rows
 * (Transaction.linkedCard set) on the card's linked payment account — one row per open bill, dated
 * on its due date, holding that bill's total. Because Account.balance/runningBalance are already
 * fully recomputed from real transactions on every write, this makes the projected balance on the
 * linked account correct through the same trusted path, instead of a separate client-side
 * projection.
 */
@ApplicationScoped
public class CreditCardBillSyncService {

  /**
   * Re-derives account.balance and every transaction's runningBalance from account.openingBalance,
   * walking transactions in chronological (occurredOn, then id) order rather than insertion order —
   * so a backdated create, an edited amount/date, or a delete all leave a consistent ledger
   * regardless of when each row was originally entered.
   */
  @Transactional
  public void recomputeAccountBalance(Account account) {
    List<Transaction> txns =
        Transaction.list("account.id", Sort.ascending("occurredOn").and("id"), account.id);
    BigDecimal running = account.openingBalance;
    for (Transaction t : txns) {
      running = running.add(t.amount);
      t.runningBalance = running;
    }
    account.balance = running;
  }

  /**
   * The single entry point — safe to call unconditionally on any account after any change that
   * might affect a card's bills or its payment- account link (a transaction create/update/delete on
   * the card, or an edit to the card's kind/dueDayOfMonth/paymentAccount).
   */
  @Transactional
  public void sync(Account card) {
    List<Transaction> existing = Transaction.list("linkedCard", card);
    boolean eligible =
        card.kind == AccountKind.CREDIT_CARD
            && card.paymentAccount != null
            && card.dueDayOfMonth != null;

    Set<Account> touched = new HashSet<>();

    if (!eligible) {
      for (Transaction t : existing) {
        touched.add(t.account);
        t.delete();
      }
      touched.forEach(this::recomputeAccountBalance);
      return;
    }

    Map<LocalDate, BigDecimal> groups = groupByBillDueDate(card);

    // Only a row already sitting on the current payment account, at a
    // still-relevant date, can be reused — anything else (stale date, or
    // left over on a since-changed payment account) is deleted below and
    // recreated fresh, which is what makes a payment-account change
    // "just work" without special-casing it.
    Map<LocalDate, Transaction> reusable = new HashMap<>();
    for (Transaction t : existing) {
      if (t.account.id.equals(card.paymentAccount.id) && !reusable.containsKey(t.occurredOn)) {
        reusable.put(t.occurredOn, t);
      } else {
        touched.add(t.account);
        t.delete();
      }
    }

    for (Map.Entry<LocalDate, BigDecimal> entry : groups.entrySet()) {
      LocalDate dueDate = entry.getKey();
      BigDecimal total = entry.getValue();
      if (total.signum() == 0) {
        continue;
      }
      Transaction row = reusable.remove(dueDate);
      if (row == null) {
        // IDENTITY generation means persist() inserts immediately —
        // every NOT NULL column must be set first.
        row = new Transaction();
        row.account = card.paymentAccount;
        row.linkedCard = card;
        row.occurredOn = dueDate;
        row.description = "Credit card bill — " + card.name;
        row.amount = total;
        row.persist();
      } else {
        row.amount = total;
      }
      touched.add(card.paymentAccount);
    }

    // Whatever's left in `reusable` no longer has a matching bill (its
    // transactions were reassigned/deleted) — remove it.
    for (Transaction stale : reusable.values()) {
      touched.add(stale.account);
      stale.delete();
    }

    touched.forEach(this::recomputeAccountBalance);
  }

  private Map<LocalDate, BigDecimal> groupByBillDueDate(Account card) {
    Map<LocalDate, BigDecimal> groups = new TreeMap<>();
    for (Transaction t : Transaction.findByAccount(card.id)) {
      LocalDate due =
          t.billDueDate != null ? t.billDueDate : nextDueDate(card.dueDayOfMonth, t.occurredOn);
      groups.merge(due, t.amount, BigDecimal::add);
    }
    return groups;
  }

  /**
   * Rolls dueDay forward to its next on-or-after occurrence relative to `from`, clamping for months
   * shorter than dueDay — mirrors the frontend's utils/date.js#nextDueDate exactly. Package-private
   * so TransactionResource can reuse it for bill-offset math on repeat/ installment series (see
   * TransactionResource#billOffsetMonths).
   */
  public LocalDate nextDueDate(int dueDay, LocalDate from) {
    LocalDate candidate = from.withDayOfMonth(Math.min(dueDay, from.lengthOfMonth()));
    if (candidate.isBefore(from)) {
      LocalDate nextMonth = from.plusMonths(1);
      candidate = nextMonth.withDayOfMonth(Math.min(dueDay, nextMonth.lengthOfMonth()));
    }
    return candidate;
  }
}
