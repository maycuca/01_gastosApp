package com.gastosapp.backend.limit;

import java.math.BigDecimal;

import com.gastosapp.backend.period.Period;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public final class LimitDtos {

    private LimitDtos() {
    }

    public record LimitRequest(
            @NotNull(message = "Campo obligatorio")
            @Positive(message = "Debe ser mayor a 0")
            @Digits(integer = 12, fraction = 2, message = "Debe tener como máximo 12 dígitos enteros y 2 decimales")
            BigDecimal limitAmount) {
    }

    /** Limit with the state of the period currently in course. {@code remaining} may be negative. */
    public record LimitResponse(Period period, BigDecimal limitAmount, BigDecimal spent, BigDecimal remaining,
            boolean exceeded) {
    }

    /** Entry of {@code exceededLimits} in the create/update expense responses. */
    public record ExceededLimit(Period period, BigDecimal limitAmount, BigDecimal spent) {
    }
}
