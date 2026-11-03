package com.ledger.service;

import jakarta.inject.Inject;
import jakarta.inject.Singleton;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * The single source of "today" for budget math. Dates are computed in the configured zone
 * ({@code ledger.budget.zone}, America/Sao_Paulo) — never with {@code LocalDate.now()}, which
 * would use the pod's default zone (UTC) and roll the day over three hours early.
 */
@Singleton
public class BudgetClock {

  private final Clock clock;

  @Inject
  public BudgetClock(
      @ConfigProperty(name = "ledger.budget.zone", defaultValue = "America/Sao_Paulo")
          ZoneId zone) {
    this(Clock.system(zone));
  }

  /** For tests: a fixed clock already carrying the zone to evaluate "today" in. */
  public BudgetClock(Clock clock) {
    this.clock = clock;
  }

  public LocalDate today() {
    return LocalDate.now(clock);
  }

  public ZoneId zone() {
    return clock.getZone();
  }
}
