package com.ledger.account;

import com.ledger.user.User;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Entity
@Table(name = "accounts")
public class Account extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id")
    public User user;

    public String name;

    public String institution;

    @Enumerated(EnumType.STRING)
    public AccountKind kind;

    @Column(precision = 14, scale = 2, nullable = false)
    public BigDecimal balance;

    /**
     * Immutable anchor set once at creation. {@code balance} and every
     * transaction's {@code runningBalance} are fully re-derived from this in
     * chronological (occurredOn) order whenever transactions change — see
     * TransactionResource#recomputeAccountBalance.
     */
    @Column(name = "opening_balance", precision = 14, scale = 2, nullable = false)
    public BigDecimal openingBalance;

    @Column(name = "last_synced_at")
    public Instant lastSyncedAt;

    public static List<Account> findByUser(Long userId) {
        return list("user.id", userId);
    }
}
