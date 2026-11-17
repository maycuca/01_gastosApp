package com.gastosapp.backend.period;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

import org.springframework.stereotype.Component;

/**
 * Calendar periods as defined in the spec:
 * <ul>
 * <li>DAY: the date itself</li>
 * <li>WEEK: Monday to Sunday</li>
 * <li>FORTNIGHT: 1st-15th, or 16th to the last day of the month</li>
 * <li>MONTH: 1st to the last day of the month</li>
 * <li>YEAR: January 1st to December 31st</li>
 * </ul>
 * "Today" comes from the injected {@link Clock} (server time zone).
 */
@Component
public class PeriodCalculator {

    private static final int FIRST_FORTNIGHT_LAST_DAY = 15;

    private final Clock clock;

    public PeriodCalculator(Clock clock) {
        this.clock = clock;
    }

    public LocalDate today() {
        return LocalDate.now(clock);
    }

    /** The period of the given type that is in course today. */
    public DateRange current(Period period) {
        return containing(period, today());
    }

    /** The period of the given type that contains {@code date}. */
    public DateRange containing(Period period, LocalDate date) {
        return switch (period) {
            case DAY -> new DateRange(date, date);
            case WEEK -> {
                LocalDate monday = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                yield new DateRange(monday, monday.plusDays(6));
            }
            case FORTNIGHT -> date.getDayOfMonth() <= FIRST_FORTNIGHT_LAST_DAY
                    ? new DateRange(date.withDayOfMonth(1), date.withDayOfMonth(FIRST_FORTNIGHT_LAST_DAY))
                    : new DateRange(date.withDayOfMonth(FIRST_FORTNIGHT_LAST_DAY + 1),
                            date.with(TemporalAdjusters.lastDayOfMonth()));
            case MONTH -> new DateRange(date.withDayOfMonth(1), date.with(TemporalAdjusters.lastDayOfMonth()));
            case YEAR -> new DateRange(date.with(TemporalAdjusters.firstDayOfYear()),
                    date.with(TemporalAdjusters.lastDayOfYear()));
        };
    }

    /**
     * The complete period immediately before {@code range}, which must be a range
     * produced by this class for the same period type. Periods of one type are
     * contiguous, so it is the one containing the day before {@code range} starts.
     */
    public DateRange previous(Period period, DateRange range) {
        return containing(period, range.from().minusDays(1));
    }
}
