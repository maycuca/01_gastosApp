package com.gastosapp.backend.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class MoneyTest {

    @ParameterizedTest
    @CsvSource({
            "150.50, 15050",
            "150.5, 15050",
            "150, 15000",
            "0.01, 1",
            "0.10, 10",
            "1E+2, 10000",
            "999999999999.99, 99999999999999"
    })
    void toCentsIsExact(String amount, long expectedCents) {
        assertThat(Money.toCents(new BigDecimal(amount))).isEqualTo(expectedCents);
    }

    @Test
    void toCentsRejectsMoreThanTwoDecimals() {
        assertThatThrownBy(() -> Money.toCents(new BigDecimal("1.005"))).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void toCentsAcceptsTrailingZerosBeyondTwoDecimals() {
        assertThat(Money.toCents(new BigDecimal("1.500"))).isEqualTo(150);
    }

    @ParameterizedTest
    @CsvSource({
            "15050, 150.50",
            "500000, 5000.00",
            "1, 0.01",
            "0, 0.00",
            "-14950, -149.50"
    })
    void toAmountAlwaysHasTwoDecimals(long cents, String expected) {
        BigDecimal amount = Money.toAmount(cents);
        assertThat(amount.scale()).isEqualTo(2);
        assertThat(amount.toString()).isEqualTo(expected);
    }

    @Test
    void sumOfTenAndTwentyCentsIsExactlyThirty() {
        long sum = Money.toCents(new BigDecimal("0.10")) + Money.toCents(new BigDecimal("0.20"));
        assertThat(Money.toAmount(sum)).isEqualTo(new BigDecimal("0.30"));
    }

    @Test
    void roundTripKeepsTheValue() {
        assertThat(Money.toAmount(Money.toCents(new BigDecimal("4850.5")))).isEqualTo(new BigDecimal("4850.50"));
    }

    @ParameterizedTest
    @CsvSource({
            // values taken from the spec's dashboard example
            "165050, 320000, 51.58",
            "485050, 500000, 97.01",
            "150000, 485050, 30.92",
            "-100000, 320000, -31.25",
            "1, 3, 33.33",
            "2, 3, 66.67",
            "512000, 500000, 102.40"
    })
    void percentageRoundsHalfUpToTwoDecimals(long part, long whole, String expected) {
        assertThat(Money.percentage(part, whole)).isEqualTo(new BigDecimal(expected));
    }
}
