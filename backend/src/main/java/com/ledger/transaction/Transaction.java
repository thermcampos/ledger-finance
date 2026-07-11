package com.ledger.transaction;

import com.ledger.account.Account;
import com.ledger.category.Category;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
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

    /** Opaque token shared by every row generated together in one repeat/installment batch. Not a FK, just a grouping value — see TransactionResource#create. Null for one-off transactions. */
    @Column(name = "series_id", length = 36)
    public String seriesId;

    /** The RepeatFrequency the series was created with, set/cleared in lockstep with seriesId. Drives scope-aware edit behavior — INSTALLMENTS re-splits on "this and future" amount edits, others flat-set. */
    @Enumerated(EnumType.STRING)
    @Column(name = "series_repeat", length = 20)
    public RepeatFrequency seriesRepeat;

    /**
     * Only meaningful for CREDIT_CARD account transactions — the bill this
     * charge was explicitly assigned to. Display/grouping tag only, same
     * spirit as seriesInfo; never read by recomputeAccountBalance. Null
     * falls back to computing nextDueDate(account.dueDayOfMonth, occurredOn).
     */
    @Column(name = "bill_due_date")
    public LocalDate billDueDate;

    /**
     * Only set on a system-generated "bill total" row living on a credit
     * card's linked payment account — the CREDIT_CARD account it represents
     * the due-date total for. Maintained exclusively by
     * CreditCardBillSyncService; TransactionResource rejects direct
     * update/delete on a transaction that has this set.
     */
    @ManyToOne
    @JoinColumn(name = "linked_card_id")
    public Account linkedCard;

    /** When this row was inserted — drives "latest added" ordering (e.g. Overview's Recent Activity). */
    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMPTZ NOT NULL DEFAULT now()")
    public Instant createdAt;

    @PrePersist
    void onPersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public static List<Transaction> findByAccount(Long accountId) {
        return list("account.id", io.quarkus.panache.common.Sort.descending("occurredOn"), accountId);
    }

    public static List<Transaction> findBySeries(String seriesId) {
        return list("seriesId", io.quarkus.panache.common.Sort.ascending("occurredOn").and("id"), seriesId);
    }
}
