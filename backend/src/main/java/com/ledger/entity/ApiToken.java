package com.ledger.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

/**
 * A bearer token that authenticates read-only LLM access under /llm/**. Only the SHA-256 hex of
 * the token is stored — the plaintext ("led_" + 32 random bytes, hex) is shown once at creation.
 * Revocation is a hard row delete.
 */
@Entity
@Table(name = "api_tokens")
public class ApiToken extends PanacheEntityBase {

  /** Only scope issued in v0; 'read-write' is reserved in the schema but not implemented. */
  public static final String SCOPE_READ = "read";

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne(optional = false)
  @JoinColumn(name = "user_id")
  public User user;

  @Column(nullable = false)
  public String name;

  @JsonIgnore
  @Column(name = "token_hash", nullable = false, unique = true, length = 64)
  public String tokenHash;

  @Column(nullable = false, length = 20)
  public String scope;

  @Column(name = "created_at", updatable = false)
  public Instant createdAt;

  @Column(name = "expires_at")
  public Instant expiresAt;

  @Column(name = "last_used_at")
  public Instant lastUsedAt;

  public static ApiToken findByTokenHash(String tokenHash) {
    return find("tokenHash", tokenHash).firstResult();
  }

  public static List<ApiToken> findByUser(Long userId) {
    return list("user.id", userId);
  }

  public static String sha256Hex(String plaintext) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(plaintext.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 not available", e);
    }
  }

  @PrePersist
  void onPersist() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }
}
