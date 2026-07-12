package com.ledger.enums;

public enum RepeatFrequency {
  NONE,
  WEEKLY,
  MONTHLY,
  YEARLY,
  /** Splits the total amount evenly across occurrences instead of repeating it. */
  INSTALLMENTS
}
