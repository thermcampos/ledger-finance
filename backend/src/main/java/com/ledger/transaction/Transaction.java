package com.ledger.transaction;

import com.ledger.account.Account;
import com.ledger.category.Category;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Entity
@Table(name = "transactions")
public class Transaction extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "account_id")
    public Account account;

    @ManyToOne
    @JoinColumn(name = "category_id")
    public Category category;

    public String description;

    @Column(precision = 14, scale = 2, nullable = false)
    public BigDecimal amount;

    @Column(name = "occurred_on", nullable = false)
    public LocalDate occurredOn;

    @Column(name = "running_balance", precision = 14, scale = 2)
    public BigDecimal runningBalance;

    /** Display-only tag like "3/12" for a transaction generated as part of a repeat/installment batch. Null otherwise. */
    @Column(name = "series_info")
    public String seriesInfo;

    public static List<Transaction> findByAccount(Long accountId) {
        return list("account.id", io.quarkus.panache.common.Sort.descending("occurredOn"), accountId);
    }
}
