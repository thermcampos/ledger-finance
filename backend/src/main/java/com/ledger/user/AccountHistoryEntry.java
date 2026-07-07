package com.ledger.user;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import io.quarkus.panache.common.Sort;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.List;

@Entity
@Table(name = "account_history")
public class AccountHistoryEntry extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id")
    public User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    public AccountHistoryField field;

    /** Null for PASSWORD entries — only the fact and date of a password change are kept, never values. */
    @Column(name = "old_value")
    public String oldValue;

    @Column(name = "new_value")
    public String newValue;

    @Column(name = "changed_at", nullable = false)
    public Instant changedAt;

    public static List<AccountHistoryEntry> findByUser(Long userId) {
        return list("user.id", Sort.descending("changedAt"), userId);
    }
}
