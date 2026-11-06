package com.ledger.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;

/**
 * One half of a one-time recovery code (ADR-0003): only the BCrypt hash is stored, so a database
 * leak doesn't hand out working codes. {@link #usedAt} set on consumption — a used code can never
 * verify again.
 */
@Entity
@Table(name = "recovery_codes")
public class RecoveryCode extends PanacheEntityBase {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne(optional = false)
  @JoinColumn(name = "user_id")
  public User user;

  @Column(name = "code_hash", nullable = false)
  public String codeHash;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "used_at")
  public Instant usedAt;

  public static List<RecoveryCode> findUnusedByUser(Long userId) {
    return list("user.id = ?1 and usedAt is null", userId);
  }

  public static void deleteByUser(Long userId) {
    delete("user.id", userId);
  }
}
