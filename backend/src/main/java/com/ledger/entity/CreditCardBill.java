package com.ledger.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@Entity
@Table(name = "credit_card_bills")
public class CreditCardBill extends PanacheEntityBase {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne(optional = false)
  @JoinColumn(name = "account_id")
  public Account account;

  @Column(name = "due_date", nullable = false)
  public LocalDate dueDate;

  @Column(name = "consolidated", nullable = false)
  public boolean consolidated;

  @Column(name = "created_at", updatable = false)
  public Instant createdAt;

  @Column(name = "updated_at")
  public Instant updatedAt;

  @Column(name = "paid", nullable = false)
  public boolean paid = false;

  @Column(name = "payment_date")
  public LocalDate paymentDate;

  @ManyToOne
  @JoinColumn(name = "payment_account_id")
  public Account paymentAccount;

  @OneToOne
  @JoinColumn(name = "payment_transaction_id")
  public Transaction paymentTransaction;

  public static CreditCardBill findByAccountAndDueDate(Long accountId, LocalDate dueDate) {
    return find("account.id = ?1 AND dueDate = ?2", accountId, dueDate).firstResult();
  }

  public static List<CreditCardBill> findByAccount(Long accountId) {
    return list("account.id", accountId);
  }

  public static CreditCardBill findByPaymentTransactionId(Long transactionId) {
    return find("paymentTransaction.id", transactionId).firstResult();
  }

  @PrePersist
  void onPersist() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
    if (updatedAt == null) {
      updatedAt = Instant.now();
    }
  }

  @PreUpdate
  public void onUpdate() {
    updatedAt = Instant.now();
  }
}
