package com.ledger.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(
    name = "budgets",
    uniqueConstraints = @UniqueConstraint(columnNames = {"category_id", "month"}))
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
  public LocalDate month;

  @Column(name = "limit_amount", precision = 14, scale = 2, nullable = false)
  public BigDecimal limitAmount;
}
