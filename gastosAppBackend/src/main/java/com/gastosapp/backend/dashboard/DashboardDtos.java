package com.gastosapp.backend.dashboard;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.gastosapp.backend.period.Period;

public final class DashboardDtos {

    private DashboardDtos() {
    }

    /** {@code changePercentage} and {@code limit} are serialized as null when they do not apply. */
    public record SummaryResponse(
            Period period,
            LocalDate from,
            LocalDate to,
            BigDecimal totalSpent,
            BigDecimal previousTotal,
            BigDecimal changePercentage,
            LimitSummary limit,
            List<CategoryAmount> byCategory,
            List<BreakdownPoint> breakdown) {
    }

    public record LimitSummary(BigDecimal limitAmount, BigDecimal remaining, BigDecimal percentageUsed,
            boolean exceeded) {
    }

    public record CategoryAmount(Long categoryId, String name, String color, BigDecimal amount,
            BigDecimal percentage) {
    }

    public record BreakdownPoint(String label, BigDecimal amount) {
    }
}
