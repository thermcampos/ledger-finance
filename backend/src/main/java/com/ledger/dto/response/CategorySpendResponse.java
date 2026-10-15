package com.ledger.dto.response;

import java.math.BigDecimal;

/**
 * spent is the raw SUM of signed transaction amounts (expenses negative, refunds positive),
 * negated into a positive "spent" figure; a net-refund month yields a negative spent.
 */
public record CategorySpendResponse(Long categoryId, String categoryName, BigDecimal spent) {
  public CategorySpendResponse {
    spent = spent.negate();
  }
}
