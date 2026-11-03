package com.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.ledger.service.BudgetClock;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/** "Today" comes from the configured zone, not the pod's UTC default. */
class BudgetClockTest {

  // 22:30 in São Paulo on Nov 3 — already Nov 4 in UTC.
  private static final Instant LATE_EVENING_SP = Instant.parse("2026-11-04T01:30:00Z");

  @Test
  void todayUsesTheConfiguredZone() {
    BudgetClock sp =
        new BudgetClock(Clock.fixed(LATE_EVENING_SP, ZoneId.of("America/Sao_Paulo")));
    assertEquals(LocalDate.of(2026, 11, 3), sp.today());
  }

  @Test
  void utcWouldHaveRolledOverEarly() {
    BudgetClock utc = new BudgetClock(Clock.fixed(LATE_EVENING_SP, ZoneOffset.UTC));
    assertEquals(LocalDate.of(2026, 11, 4), utc.today());
  }
}
