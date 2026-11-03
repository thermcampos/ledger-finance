package com.ledger.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import org.hibernate.annotations.ColumnDefault;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "users")
public class User extends PanacheEntityBase {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @Column(nullable = false, unique = true)
  public String email;

  @JsonIgnore
  @Column(name = "password_hash", nullable = false)
  public String passwordHash;

  @Column(name = "display_name")
  public String displayName;

  @Column(name = "created_at", updatable = false)
  public Instant createdAt;

  /** Master switch for the daily budget digest (Profile → "Email summaries"). */
  @ColumnDefault("false") // matches V18, so dev drop-and-create and plain SQL inserts agree
  @Column(name = "email_summaries_enabled", nullable = false)
  public boolean emailSummariesEnabled;

  public static User findByEmail(String email) {
    return find("email", email).firstResult();
  }
}
