package com.ledger.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A single row extracted from an uploaded CSV/PDF, before it becomes a real Transaction. Not
 * persisted.
 */
public record ParsedImportRow(
    String tempId, String description, LocalDate occurredOn, BigDecimal amount) {

  public ParsedImportRow {
    tempId = UUID.randomUUID().toString();
  }
}
