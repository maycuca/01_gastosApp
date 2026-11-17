package com.gastosapp.backend.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Conversion between API amounts (decimal, 2 places) and stored amounts
 * (integer cents). Always exact: BigDecimal/long only, never floating point.
 */
public final class Money {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private Money() {
    }

    /**
     * @throws ArithmeticException if the amount has more than 2 decimals or does not fit in a long
     */
    public static long toCents(BigDecimal amount) {
        return amount.movePointRight(2).longValueExact();
    }

    /** Amount with exactly 2 decimals, e.g. 15050 -> 150.50. */
    public static BigDecimal toAmount(long cents) {
        return BigDecimal.valueOf(cents, 2);
    }

    /** {@code part / whole * 100} rounded half-up to 2 decimals. {@code whole} must not be 0. */
    public static BigDecimal percentage(long part, long whole) {
        return BigDecimal.valueOf(part).multiply(HUNDRED).divide(BigDecimal.valueOf(whole), 2, RoundingMode.HALF_UP);
    }
}
