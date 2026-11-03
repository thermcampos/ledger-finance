package com.ledger.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import java.time.YearMonth;
import org.junit.jupiter.api.Test;

/** Days left includes today: {@code lastDay − today + 1}, never 0 in the current month. */
class BudgetDaysLeftTest {

  private static final YearMonth NOV = YearMonth.of(2026, 11);

  @Test
  void firstDayCountsTheWholeMonth() {
    assertEquals(30, BudgetSpendService.daysLeft(NOV, LocalDate.of(2026, 11, 1)));
  }

  @Test
  void midMonth() {
    assertEquals(28, BudgetSpendService.daysLeft(NOV, LocalDate.of(2026, 11, 3)));
  }

  @Test
  void lastDayIsOneNotZero() {
    assertEquals(1, BudgetSpendService.daysLeft(NOV, LocalDate.of(2026, 11, 30)));
  }

  @Test
  void pastAndFutureMonths() {
    assertEquals(0, BudgetSpendService.daysLeft(NOV, LocalDate.of(2026, 12, 1)));
    assertEquals(30, BudgetSpendService.daysLeft(NOV, LocalDate.of(2026, 10, 31)));
  }
}
