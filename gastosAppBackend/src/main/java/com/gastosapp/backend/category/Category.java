package com.gastosapp.backend.category;

import java.time.LocalDateTime;

import com.gastosapp.backend.common.LocalDateTimeTextConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "categories")
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String color;

    @Convert(converter = LocalDateTimeTextConverter.class)
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Convert(converter = LocalDateTimeTextConverter.class)
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected Category() {
    }

    public Category(Long userId, String name, String color, LocalDateTime now) {
        this.userId = userId;
        this.name = name;
        this.color = color;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(String name, String color, LocalDateTime now) {
        this.name = name;
        this.color = color;
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getName() {
        return name;
    }

    public String getColor() {
        return color;
    }
}
