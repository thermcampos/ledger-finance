package com.ledger.email;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/** Money as the Budgets page prints it ({@code Budgets.jsx#money}): {@code $1,742.10}. */
public final class Money {

  private Money() {}

  /** Absolute value, like {@code money()} — the page shows spent and limit this way. */
  public static String abs(BigDecimal amount) {
    DecimalFormat format = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.US));
    format.setRoundingMode(RoundingMode.HALF_UP);
    return "$" + format.format(amount.abs());
  }

  /** {@code -$12.00} for negatives — the page's "left" when over budget. */
  public static String signed(BigDecimal amount) {
    return (amount.signum() < 0 ? "-" : "") + abs(amount);
  }
}
