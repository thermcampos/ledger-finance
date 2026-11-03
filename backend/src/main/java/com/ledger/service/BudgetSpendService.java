package com.ledger.service;

import com.ledger.dto.response.BudgetSummaryResponse;
import com.ledger.dto.response.CategorySpendResponse;
import com.ledger.entity.Budget;
import com.ledger.entity.User;
import com.ledger.enums.BudgetStatus;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Per-category spend derived live from transactions (never stored on Budget — it would drift).
 *
 * <p>Exclusions, shared by every caller:
 *
 * <ul>
 *   <li>System-generated budget projection rows ({@code linkedBudget} set) — they represent what
 *       is still available, not what was spent; counting them would make the projection collapse
 *       its own input.
 *   <li>Internal categories (e.g. "Card payment") — a bill payment mirrors purchases already
 *       counted on the card.
 *   <li>Uncategorised rows.
 * </ul>
 *
 * Amounts are summed signed: expenses (negative) add to "spent", refunds subtract from it.
 */
@ApplicationScoped
public class BudgetSpendService {

  @Inject EntityManager em;

  @Inject BudgetClock clock;

  /**
   * Spend for a calendar month. Rows dated after today are left out unless includeUpcoming is
   * set (the Report page's toggle).
   */
  public List<CategorySpendResponse> spendForMonth(
      User user, YearMonth month, boolean includeUpcoming) {
    LocalDate start = month.atDay(1);
    LocalDate end = month.atEndOfMonth();
    LocalDate today = clock.today();
    if (!includeUpcoming && end.isAfter(today)) {
      end = today;
    }
    return spendBetween(user, start, end);
  }

  /** Spend between two dates, both inclusive. An empty range yields an empty list. */
  public List<CategorySpendResponse> spendBetween(User user, LocalDate start, LocalDate end) {
    if (end.isBefore(start)) {
      return List.of();
    }
    return em.createQuery(
            "SELECT new com.ledger.dto.response.CategorySpendResponse("
                + "t.category.id, t.category.name, SUM(t.amount)) "
                + "FROM Transaction t "
                + "WHERE t.account.user.id = :userId "
                + "AND t.category IS NOT NULL "
                + "AND t.category.internal = false "
                + "AND t.linkedBudget IS NULL "
                + "AND t.occurredOn BETWEEN :start AND :end "
                + "GROUP BY t.category.id, t.category.name",
            CategorySpendResponse.class)
        .setParameter("userId", user.id)
        .setParameter("start", start)
        .setParameter("end", end)
        .getResultList();
  }

  /** Every budget of the user with this month's spend (upcoming rows excluded), by category name. */
  public BudgetSummaryResponse summaryForMonth(User user, YearMonth month) {
    LocalDate today = clock.today();
    int daysLeft = daysLeft(month, today);

    Map<Long, BigDecimal> spentByCategory =
        spendForMonth(user, month, false).stream()
            .collect(
                Collectors.toMap(CategorySpendResponse::categoryId, CategorySpendResponse::spent));

    List<Budget> budgets = Budget.list("user.id = ?1", user.id);
    List<BudgetSummaryResponse.Item> items =
        budgets.stream()
            .sorted(
                Comparator.comparing(
                    (Budget b) -> b.category.name, String.CASE_INSENSITIVE_ORDER))
            .map(
                b ->
                    item(
                        b, spentByCategory.getOrDefault(b.category.id, BigDecimal.ZERO), daysLeft))
            .toList();

    return new BudgetSummaryResponse(month, today, daysLeft, items);
  }

  /** {@code lastDay − today + 1} for the current month; 0 when past, full length when future. */
  static int daysLeft(YearMonth month, LocalDate today) {
    YearMonth current = YearMonth.from(today);
    if (month.isBefore(current)) {
      return 0;
    }
    if (month.isAfter(current)) {
      return month.lengthOfMonth();
    }
    return (int) ChronoUnit.DAYS.between(today, month.atEndOfMonth()) + 1;
  }

  private static BudgetSummaryResponse.Item item(Budget b, BigDecimal spent, int daysLeft) {
    BigDecimal limit = b.limitAmount;
    BigDecimal left = limit.subtract(spent);
    BigDecimal perDay =
        left.signum() > 0 && daysLeft > 0
            ? left.divide(BigDecimal.valueOf(daysLeft), 2, RoundingMode.HALF_UP)
            : null;
    return new BudgetSummaryResponse.Item(
        b.id,
        b.category.id,
        b.category.name,
        limit,
        spent,
        left,
        BudgetStatus.of(spent, limit),
        perDay);
  }
}
