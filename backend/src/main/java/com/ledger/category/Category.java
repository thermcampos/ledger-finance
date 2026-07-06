package com.ledger.category;

import com.ledger.user.User;
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

    public static List<Category> findByUser(Long userId) {
        return list("user.id", userId);
    }
}
