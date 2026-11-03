package com.ledger.dto.response;

import java.math.BigDecimal;

/**
 * spent is the raw SUM of signed transaction amounts (expenses negative, refunds positive),
 * negated into a positive "spent" figure; a net-refund month yields a negative spent. internal
 * marks a system category (e.g. "Card payment") — only present when the caller asked for them.
 */
public record CategorySpendResponse(
    Long categoryId, String categoryName, BigDecimal spent, boolean internal) {
  public CategorySpendResponse {
    spent = spent.negate();
  }
}
