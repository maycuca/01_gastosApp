package com.gastosapp.backend.expense;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

import com.gastosapp.backend.category.Category;
import com.gastosapp.backend.common.LocalDateTextConverter;
import com.gastosapp.backend.common.LocalDateTimeTextConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "expenses")
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private Long userId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @Column(nullable = false)
    private long amountCents;

    @Column(nullable = false)
    private String description;

    /** Immutable after creation. */
    @Convert(converter = LocalDateTextConverter.class)
    @Column(nullable = false, updatable = false)
    private LocalDate date;

    @ManyToMany
    @JoinTable(name = "expense_tags",
            joinColumns = @JoinColumn(name = "expense_id"),
            inverseJoinColumns = @JoinColumn(name = "tag_id"))
    private Set<Tag> tags = new HashSet<>();

    @Convert(converter = LocalDateTimeTextConverter.class)
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Convert(converter = LocalDateTimeTextConverter.class)
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected Expense() {
    }

    public Expense(Long userId, Category category, long amountCents, String description, LocalDate date,
            Set<Tag> tags, LocalDateTime now) {
        this.userId = userId;
        this.category = category;
        this.amountCents = amountCents;
        this.description = description;
        this.date = date;
        this.tags.addAll(tags);
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(Category category, long amountCents, String description, Set<Tag> tags, LocalDateTime now) {
        this.category = category;
        this.amountCents = amountCents;
        this.description = description;
        this.tags.retainAll(tags);
        this.tags.addAll(tags);
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public Category getCategory() {
        return category;
    }

    public long getAmountCents() {
        return amountCents;
    }

    public String getDescription() {
        return description;
    }

    public LocalDate getDate() {
        return date;
    }

    public Set<Tag> getTags() {
        return tags;
    }
}
