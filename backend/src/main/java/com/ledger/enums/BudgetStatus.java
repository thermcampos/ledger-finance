package com.ledger.enums;

import java.math.BigDecimal;

/**
 * Budget health — the backend is the source of truth for the status word shown on the Budgets
 * page and in the daily digest.
 */
public enum BudgetStatus {
  ON_TRACK("On track"),
  NEAR_LIMIT("Near limit"),
  OVER_BUDGET("Over budget");

  /** Spent at or above this percentage of the limit is "Near limit". */
  public static final BigDecimal NEAR_LIMIT_PERCENT = new BigDecimal("85");

  private static final BigDecimal HUNDRED = new BigDecimal("100");

  private final String label;

  BudgetStatus(String label) {
    this.label = label;
  }

  public String label() {
    return label;
  }

  /**
   * A non-positive limit counts as 0% used (matches the frontend's historical behaviour), so it
   * is always On track.
   */
  public static BudgetStatus of(BigDecimal spent, BigDecimal limit) {
    if (limit == null || limit.signum() <= 0) {
      return ON_TRACK;
    }
    // spent * 100 >= limit * threshold  ⇔  spent / limit * 100 >= threshold, without division.
    BigDecimal scaled = spent.multiply(HUNDRED);
    if (scaled.compareTo(limit.multiply(HUNDRED)) >= 0) {
      return OVER_BUDGET;
    }
    if (scaled.compareTo(limit.multiply(NEAR_LIMIT_PERCENT)) >= 0) {
      return NEAR_LIMIT;
    }
    return ON_TRACK;
  }
}
