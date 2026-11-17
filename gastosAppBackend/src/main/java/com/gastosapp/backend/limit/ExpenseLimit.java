package com.gastosapp.backend.limit;

import java.time.LocalDateTime;

import com.gastosapp.backend.common.LocalDateTimeTextConverter;
import com.gastosapp.backend.period.Period;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "expense_limits")
public class ExpenseLimit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Period period;

    @Column(nullable = false)
    private long limitCents;

    @Convert(converter = LocalDateTimeTextConverter.class)
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Convert(converter = LocalDateTimeTextConverter.class)
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected ExpenseLimit() {
    }

    public ExpenseLimit(Long userId, Period period, long limitCents, LocalDateTime now) {
        this.userId = userId;
        this.period = period;
        this.limitCents = limitCents;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void replace(long limitCents, LocalDateTime now) {
        this.limitCents = limitCents;
        this.updatedAt = now;
    }

    public Period getPeriod() {
        return period;
    }

    public long getLimitCents() {
        return limitCents;
    }
}
