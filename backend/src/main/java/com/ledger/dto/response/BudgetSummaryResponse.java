package com.ledger.dto.response;

import com.ledger.enums.BudgetStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * Every budget of the user with its spend for one month — the numbers the Budgets page shows
 * and the daily digest sends, computed in one place.
 *
 * @param today "today" in the budget zone
 * @param daysLeft days remaining in the month, today included ({@code lastDay − today + 1}, so
 *     ≥ 1 for the current month); 0 for a past month, the full length for a future month
 */
public record BudgetSummaryResponse(
    YearMonth yearMonth, LocalDate today, int daysLeft, List<Item> budgets) {

  /**
   * @param spent signed spend (refunds subtract); same figure as the spend endpoint
   * @param left {@code limit − spent}; negative when over budget
   * @param perDay {@code left / daysLeft} rounded half-up to cents; null when nothing is left or
   *     no days remain
   */
  public record Item(
      Long budgetId,
      Long categoryId,
      String categoryName,
      BigDecimal limit,
      BigDecimal spent,
      BigDecimal left,
      BudgetStatus status,
      BigDecimal perDay) {}
}
