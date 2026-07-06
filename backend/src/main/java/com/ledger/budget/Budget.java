package com.ledger.budget;

import com.ledger.category.Category;
import com.ledger.user.User;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(name = "budgets", uniqueConstraints = @UniqueConstraint(columnNames = {"category_id", "month"}))
public class Budget extends PanacheEntityBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id")
    public User user;

    @ManyToOne(optional = false)
    @JoinColumn(name = "category_id")
    public Category category;

    /** First day of the budgeted month, e.g. 2026-07-01 */
    @Column(name = "month", nullable = false)
    public java.time.LocalDate month;

    @Column(name = "limit_amount", precision = 14, scale = 2, nullable = false)
    public BigDecimal limitAmount;
}
