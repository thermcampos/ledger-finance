package com.ledger.service;

import com.ledger.entity.Account;
import com.ledger.entity.Budget;
import com.ledger.entity.Transaction;
import com.ledger.entity.User;
import com.ledger.enums.AccountKind;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Keeps one system-generated "budget projection" Transaction row per budget that has an
 * account — dated on the last day of the current month, holding the amount still available
 * (limitAmount minus the month's real spend in the category, projections excluded). Mirrors
 * CreditCardBillSyncService: rows are marked via Transaction.linkedBudget, TransactionResource
 * rejects direct edits/deletes on them, and sync() is safe to call unconditionally — it
 * self-corrects a changed/cleared account, an over-budget budget (no row when nothing is left
 * to spend), and month rollover (last month's row no longer matches the current last day and
 * is replaced). A projection on a credit card deliberately feeds that card's bill, so any
 * touched card is re-synced through CreditCardBillSyncService afterwards.
 */
@ApplicationScoped
public class BudgetProjectionSyncService {

  @Inject EntityManager em;

  @Inject CreditCardBillSyncService billSync;

  /** The single entry point — safe to call unconditionally on any budget after any change. */
  @Transactional
  public void sync(Budget budget) {
    LocalDate today = LocalDate.now();
    LocalDate lastDay = today.withDayOfMonth(today.lengthOfMonth());
    Account target = budget.account;

    BigDecimal remaining = budget.limitAmount.subtract(spentThisMonth(budget));
    boolean eligible = target != null && isProjectable(target.kind) && remaining.signum() > 0;

    Set<Account> touched = new HashSet<>();

    Transaction row = null;
    List<Transaction> existing = Transaction.list("linkedBudget", budget);
    for (Transaction t : existing) {
      if (eligible && row == null && t.account.id.equals(target.id) && t.occurredOn.equals(lastDay)) {
        row = t;
      } else {
        touched.add(t.account);
        t.delete();
      }
    }

    if (eligible) {
      if (row == null) {
        // IDENTITY generation means persist() inserts immediately —
        // every NOT NULL column must be set first.
        row = new Transaction();
        row.account = target;
        row.category = budget.category;
        row.linkedBudget = budget;
        row.occurredOn = lastDay;
        row.completed = false;
        row.description = "Budget projection — " + budget.category.name;
        row.amount = remaining.negate();
        row.persist();
      } else {
        row.description = "Budget projection — " + budget.category.name;
        row.amount = remaining.negate();
      }
      touched.add(target);
    }

    resync(touched);
  }

  /** Syncs the budget for the given category, if one exists and has a projection account. */
  @Transactional
  public void syncForCategory(User user, Long categoryId) {
    if (categoryId == null) {
      return;
    }
    Budget budget =
        Budget.find("user.id = ?1 and category.id = ?2", user.id, categoryId).firstResult();
    if (budget != null && budget.account != null) {
      sync(budget);
    }
  }

  /**
   * Lazy rollover driver for read paths (GET /budgets, the spend endpoint) — this project has
   * no scheduler by design, so a new month is detected here instead.
   */
  @Transactional
  public void syncAll(User user) {
    List<Budget> budgets = Budget.list("user.id = ?1 and account is not null", user.id);
    budgets.forEach(this::sync);
  }

  /** Deletes every projection row for a budget (budget delete, projection account delete). */
  @Transactional
  public void clear(Budget budget) {
    Set<Account> touched = new HashSet<>();
    List<Transaction> existing = Transaction.list("linkedBudget", budget);
    for (Transaction t : existing) {
      touched.add(t.account);
      t.delete();
    }
    resync(touched);
  }

  public boolean isProjectable(AccountKind kind) {
    return kind == AccountKind.CHECKING
        || kind == AccountKind.SAVINGS
        || kind == AccountKind.CREDIT_CARD;
  }

  private void resync(Set<Account> touched) {
    touched.forEach(billSync::recomputeAccountBalance);
    for (Account account : touched) {
      if (account.kind == AccountKind.CREDIT_CARD) {
        billSync.sync(account);
      }
    }
  }

  /** Real spend this month in the budget's category — expense rows only, projections excluded. */
  private BigDecimal spentThisMonth(Budget budget) {
    LocalDate today = LocalDate.now();
    BigDecimal sum =
        em.createQuery(
                "SELECT SUM(t.amount) FROM Transaction t "
                    + "WHERE t.account.user.id = :userId "
                    + "AND t.category.id = :categoryId "
                    + "AND t.amount < 0 "
                    + "AND t.linkedBudget IS NULL "
                    + "AND t.occurredOn BETWEEN :start AND :end",
                BigDecimal.class)
            .setParameter("userId", budget.user.id)
            .setParameter("categoryId", budget.category.id)
            .setParameter("start", today.withDayOfMonth(1))
            .setParameter("end", today)
            .getSingleResult();
    return sum != null ? sum.negate() : BigDecimal.ZERO;
  }
}
