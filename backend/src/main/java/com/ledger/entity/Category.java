package com.ledger.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;

import java.util.List;

@Entity
@Table(name = "categories")
public class Category extends PanacheEntityBase {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  public Long id;

  @ManyToOne(optional = false)
  @JoinColumn(name = "user_id")
  public User user;

  public String name;

  @Column(name = "color_hex")
  public String colorHex;

  public String icon;

  @Column(nullable = false)
  public boolean internal = false;

  public static List<Category> findByUser(Long userId) {
    return list("user.id", userId);
  }

  public static List<Category> findVisibleByUser(Long userId) {
    return list("user.id = ?1 and internal = false", userId);
  }

  public static Category findByUserAndName(Long userId, String name) {
    return find("user.id = ?1 and name = ?2", userId, name).firstResult();
  }
}
