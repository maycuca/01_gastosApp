package com.gastosapp.backend.api;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Clock whose "now" is set by each test, so period calculations do not depend on the real date. */
public class MutableClock extends Clock {

    private final ZoneId zone;
    private volatile Instant instant;

    public MutableClock(ZoneId zone) {
        this.zone = zone;
        this.instant = Instant.now();
    }

    /** "Today" becomes {@code date} (at noon, server time zone). */
    public void setDate(LocalDate date) {
        this.instant = date.atTime(12, 0).atZone(zone).toInstant();
    }

    public void setInstant(Instant instant) {
        this.instant = instant;
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId newZone) {
        MutableClock copy = new MutableClock(newZone);
        copy.instant = instant;
        return copy;
    }

    @Override
    public Instant instant() {
        return instant;
    }
}
