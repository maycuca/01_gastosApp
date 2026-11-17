package com.gastosapp.backend.period;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class PeriodCalculatorTest {

    private static final ZoneId ZONE = ZoneId.of("America/Mexico_City");

    private static PeriodCalculator calculatorAt(String today) {
        return new PeriodCalculator(Clock.fixed(LocalDate.parse(today).atTime(12, 0).atZone(ZONE).toInstant(), ZONE));
    }

    private static DateRange range(String from, String to) {
        return new DateRange(LocalDate.parse(from), LocalDate.parse(to));
    }

    @ParameterizedTest(name = "{0} on {1} -> {2}..{3}, previous {4}..{5}")
    @CsvSource({
            // period, today, from, to, previous from, previous to
            "DAY,       2026-11-15, 2026-11-15, 2026-11-15, 2026-11-14, 2026-11-14",
            "DAY,       2026-01-01, 2026-01-01, 2026-01-01, 2025-12-31, 2025-12-31",
            "DAY,       2024-03-01, 2024-03-01, 2024-03-01, 2024-02-29, 2024-02-29",

            // 2026-11-15 is a Sunday, 2026-11-09 a Monday
            "WEEK,      2026-11-15, 2026-11-09, 2026-11-15, 2026-11-02, 2026-11-08",
            "WEEK,      2026-11-09, 2026-11-09, 2026-11-15, 2026-11-02, 2026-11-08",
            "WEEK,      2026-11-11, 2026-11-09, 2026-11-15, 2026-11-02, 2026-11-08",
            "WEEK,      2026-11-16, 2026-11-16, 2026-11-22, 2026-11-09, 2026-11-15",
            // weeks crossing month and year boundaries (2026-01-01 is a Thursday)
            "WEEK,      2026-11-01, 2026-10-26, 2026-11-01, 2026-10-19, 2026-10-25",
            "WEEK,      2026-01-01, 2025-12-29, 2026-01-04, 2025-12-22, 2025-12-28",

            "FORTNIGHT, 2026-11-01, 2026-11-01, 2026-11-15, 2026-10-16, 2026-10-31",
            "FORTNIGHT, 2026-11-15, 2026-11-01, 2026-11-15, 2026-10-16, 2026-10-31",
            "FORTNIGHT, 2026-11-16, 2026-11-16, 2026-11-30, 2026-11-01, 2026-11-15",
            "FORTNIGHT, 2026-11-30, 2026-11-16, 2026-11-30, 2026-11-01, 2026-11-15",
            "FORTNIGHT, 2026-12-31, 2026-12-16, 2026-12-31, 2026-12-01, 2026-12-15",
            "FORTNIGHT, 2026-01-10, 2026-01-01, 2026-01-15, 2025-12-16, 2025-12-31",
            "FORTNIGHT, 2026-03-05, 2026-03-01, 2026-03-15, 2026-02-16, 2026-02-28",
            "FORTNIGHT, 2024-03-05, 2024-03-01, 2024-03-15, 2024-02-16, 2024-02-29",
            "FORTNIGHT, 2024-02-20, 2024-02-16, 2024-02-29, 2024-02-01, 2024-02-15",

            "MONTH,     2026-11-15, 2026-11-01, 2026-11-30, 2026-10-01, 2026-10-31",
            "MONTH,     2026-01-31, 2026-01-01, 2026-01-31, 2025-12-01, 2025-12-31",
            "MONTH,     2026-03-31, 2026-03-01, 2026-03-31, 2026-02-01, 2026-02-28",
            "MONTH,     2024-03-31, 2024-03-01, 2024-03-31, 2024-02-01, 2024-02-29",
            "MONTH,     2024-02-29, 2024-02-01, 2024-02-29, 2024-01-01, 2024-01-31",

            "YEAR,      2026-11-15, 2026-01-01, 2026-12-31, 2025-01-01, 2025-12-31",
            "YEAR,      2026-01-01, 2026-01-01, 2026-12-31, 2025-01-01, 2025-12-31",
            "YEAR,      2025-12-31, 2025-01-01, 2025-12-31, 2024-01-01, 2024-12-31"
    })
    void currentAndPreviousPeriod(Period period, String today, String from, String to, String previousFrom,
            String previousTo) {
        PeriodCalculator calculator = calculatorAt(today);

        DateRange current = calculator.current(period);

        assertThat(current).isEqualTo(range(from, to));
        assertThat(calculator.previous(period, current)).isEqualTo(range(previousFrom, previousTo));
    }

    @Test
    void containingUsesTheGivenDateInsteadOfToday() {
        PeriodCalculator calculator = calculatorAt("2026-11-15");
        LocalDate date = LocalDate.parse("2026-02-20");

        assertThat(calculator.containing(Period.DAY, date)).isEqualTo(range("2026-02-20", "2026-02-20"));
        assertThat(calculator.containing(Period.WEEK, date)).isEqualTo(range("2026-02-16", "2026-02-22"));
        assertThat(calculator.containing(Period.FORTNIGHT, date)).isEqualTo(range("2026-02-16", "2026-02-28"));
        assertThat(calculator.containing(Period.MONTH, date)).isEqualTo(range("2026-02-01", "2026-02-28"));
        assertThat(calculator.containing(Period.YEAR, date)).isEqualTo(range("2026-01-01", "2026-12-31"));
    }

    @Test
    void everyPeriodContainsItsDateAndIsContiguousWithThePreviousOne() {
        PeriodCalculator calculator = calculatorAt("2026-11-15");
        for (LocalDate date = LocalDate.parse("2023-12-25"); date.isBefore(LocalDate.parse("2025-01-10"));
                date = date.plusDays(1)) {
            for (Period period : Period.values()) {
                DateRange current = calculator.containing(period, date);
                DateRange previous = calculator.previous(period, current);

                assertThat(current.contains(date)).isTrue();
                assertThat(previous.to()).isEqualTo(current.from().minusDays(1));
                assertThat(calculator.containing(period, previous.from())).isEqualTo(previous);
            }
        }
    }

    @Test
    void todayIsReadInTheClockZone() {
        // 2026-11-16T02:00Z is still November 15th in Mexico City (UTC-6).
        Clock clock = Clock.fixed(java.time.Instant.parse("2026-11-16T02:00:00Z"), ZONE);

        assertThat(new PeriodCalculator(clock).today()).isEqualTo(LocalDate.parse("2026-11-15"));
    }
}
