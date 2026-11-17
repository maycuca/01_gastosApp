package com.gastosapp.backend.period;

import java.time.LocalDate;

/** Date range, inclusive on both ends. */
public record DateRange(LocalDate from, LocalDate to) {

    public DateRange {
        if (to.isBefore(from)) {
            throw new IllegalArgumentException("'to' must not be before 'from'");
        }
    }

    public boolean contains(LocalDate date) {
        return !date.isBefore(from) && !date.isAfter(to);
    }
}
