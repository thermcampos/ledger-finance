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

/**
 * The login challenge between a correct password and the JWT (ADR-0003). Created only after the
 * password verifies; carries the brute-force budget ({@link #attempts}, shared by TOTP and
 * recovery codes) and dies on success, exhaustion, or {@link #expiresAt}.
 */
@Entity
@Table(name = "pending_logins")
public class PendingLogin extends PanacheEntityBase {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  /** Opaque 256-bit random credential the client holds during the challenge. Not a JWT. */
  @Column(nullable = false, unique = true, length = 64)
  public String token;

  @ManyToOne(optional = false)
  @JoinColumn(name = "user_id")
  public User user;

  @Column(nullable = false)
  public int attempts;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "expires_at", nullable = false)
  public Instant expiresAt;

  public static PendingLogin findByToken(String token) {
    return find("token", token).firstResult();
  }

  public static void deleteByUser(Long userId) {
    delete("user.id", userId);
  }

  /** Opportunistic purge — expired rows are also deleted on read, this just keeps the table tiny. */
  public static void deleteExpired(Instant now) {
    delete("expiresAt < ?1", now);
  }
}
