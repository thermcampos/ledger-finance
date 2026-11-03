package com.ledger.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import org.hibernate.annotations.ColumnDefault;
import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(
    name = "budgets",
    uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "category_id"}))
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

  /**
   * Optional projection target. When set, BudgetProjectionSyncService maintains one
   * system-generated Transaction on this account, dated on the last day of the current month,
   * holding the amount still available under this budget. Null means no projection.
   */
  @ManyToOne
  @JoinColumn(name = "account_id")
  public Account account;

  @Column(name = "limit_amount", precision = 14, scale = 2, nullable = false)
  public BigDecimal limitAmount;

  /**
   * Include this budget in the daily email digest. Only takes effect when the owner's
   * User.emailSummariesEnabled master switch is on.
   */
  @ColumnDefault("false") // matches V18, so dev drop-and-create and plain SQL inserts agree
  @Column(name = "daily_email_summary", nullable = false)
  public boolean dailyEmailSummary;
}
