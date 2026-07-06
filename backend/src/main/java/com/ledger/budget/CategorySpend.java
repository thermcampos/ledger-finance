package com.ledger.budget;

import java.math.BigDecimal;

public class CategorySpend {

    public Long categoryId;
    public String categoryName;
    public BigDecimal spent;

    /** totalAmount is the raw SUM of (negative) transaction amounts; we store it as a positive "spent" figure. */
    public CategorySpend(Long categoryId, String categoryName, BigDecimal totalAmount) {
        this.categoryId = categoryId;
        this.categoryName = categoryName;
        this.spent = totalAmount.negate();
    }
}
