package com.ledger.dto.response;

import java.math.BigDecimal;

/**
 * spent is the raw SUM of (negative) transaction amounts; we store it as a positive "spent" figure.
 */
public record CategorySpendResponse(Long categoryId, String categoryName, BigDecimal spent) {
  public CategorySpendResponse {
    spent = spent.negate();
  }
}
