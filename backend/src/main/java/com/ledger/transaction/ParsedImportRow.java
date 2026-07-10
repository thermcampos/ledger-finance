package com.ledger.transaction;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** A single row extracted from an uploaded CSV/PDF, before it becomes a real Transaction. Not persisted. */
public class ParsedImportRow {
    public String tempId = UUID.randomUUID().toString();
    public String description;
    public LocalDate occurredOn;
    public BigDecimal amount;

    public ParsedImportRow() {
    }

    public ParsedImportRow(String description, LocalDate occurredOn, BigDecimal amount) {
        this.description = description;
        this.occurredOn = occurredOn;
        this.amount = amount;
    }
}
