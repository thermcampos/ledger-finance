package com.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.ledger.enums.BudgetStatus;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** The three status thresholds — the backend is the source of truth for the status word. */
class BudgetStatusTest {

  @ParameterizedTest(name = "spent {0} of {1} → {2}")
  @CsvSource({
    "0.00, 100.00, ON_TRACK",
    "84.99, 100.00, ON_TRACK",
    "85.00, 100.00, NEAR_LIMIT",
    "99.99, 100.00, NEAR_LIMIT",
    "100.00, 100.00, OVER_BUDGET",
    "150.00, 100.00, OVER_BUDGET",
    "1700.00, 2000.00, NEAR_LIMIT",
    "1699.99, 2000.00, ON_TRACK",
    "-20.00, 100.00, ON_TRACK",
  })
  void thresholds(String spent, String limit, BudgetStatus expected) {
    assertEquals(expected, BudgetStatus.of(new BigDecimal(spent), new BigDecimal(limit)));
  }

  @Test
  void nonPositiveLimitIsOnTrack() {
    assertEquals(BudgetStatus.ON_TRACK, BudgetStatus.of(new BigDecimal("10"), BigDecimal.ZERO));
  }

  @Test
  void labelsMatchTheUi() {
    assertEquals("On track", BudgetStatus.ON_TRACK.label());
    assertEquals("Near limit", BudgetStatus.NEAR_LIMIT.label());
    assertEquals("Over budget", BudgetStatus.OVER_BUDGET.label());
  }
}
