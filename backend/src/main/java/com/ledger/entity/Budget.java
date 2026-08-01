package com.ledger.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
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

  @Column(name = "limit_amount", precision = 14, scale = 2, nullable = false)
  public BigDecimal limitAmount;
}
