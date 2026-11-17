package com.gastosapp.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.gastosapp.backend.api.MutableClock;

/** Memory bound of the login attempt limiter (spec section 1, kept in memory). */
class LoginAttemptLimiterTest {

    private final MutableClock clock = new MutableClock(ZoneId.systemDefault());

    @BeforeEach
    void setUp() {
        clock.setDate(LocalDate.of(2026, 11, 18));
    }

    private void lock(LoginAttemptLimiter limiter, String username) {
        for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
            limiter.recordFailure(username);
        }
    }

    @Test
    void inventedUsernamesNeverGrowTheMapBeyondItsCapacity() {
        LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock, 100);

        for (int i = 0; i < 10_000; i++) {
            limiter.recordFailure("invented-" + i);
            clock.setInstant(clock.instant().plusMillis(1));
        }

        assertThat(limiter.trackedUsernames()).isEqualTo(100);
    }

    @Test
    void lockedUsernamesSurviveAFloodOfInventedUsernames() {
        LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock, 50);
        lock(limiter, "victima");

        for (int i = 0; i < 5_000; i++) {
            limiter.recordFailure("invented-" + i);
        }

        assertThat(limiter.remainingLock("victima")).contains(LoginAttemptLimiter.LOCK_DURATION);
        assertThat(limiter.trackedUsernames()).isLessThanOrEqualTo(50);
    }

    @Test
    void expiredLocksAreDroppedBeforeAnythingElse() {
        LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock, 3);
        lock(limiter, "a");
        lock(limiter, "b");
        clock.setInstant(clock.instant().plus(Duration.ofMinutes(1)));
        lock(limiter, "c");
        clock.setInstant(clock.instant().plus(Duration.ofMinutes(14)));

        limiter.recordFailure("d");

        assertThat(limiter.remainingLock("c")).isPresent();
        assertThat(limiter.trackedUsernames()).isEqualTo(2);
    }

    @Test
    void whenEveryEntryIsLockedTheOneEndingSoonestIsEvicted() {
        LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock, 2);
        lock(limiter, "first");
        clock.setInstant(clock.instant().plusSeconds(10));
        lock(limiter, "second");

        limiter.recordFailure("third");

        assertThat(limiter.remainingLock("first")).isEmpty();
        assertThat(limiter.remainingLock("second")).isPresent();
        assertThat(limiter.trackedUsernames()).isEqualTo(2);
    }

    @Test
    void successRemovesTheEntry() {
        LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock, 10);
        limiter.recordFailure(" Ana ");

        limiter.recordSuccess("ana");

        assertThat(limiter.trackedUsernames()).isZero();
    }

    @Test
    void remainingLockIsMeasuredWithTheInjectedClock() {
        LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock, 10);
        Instant start = clock.instant();
        lock(limiter, "ana");

        clock.setInstant(start.plus(Duration.ofMinutes(7)));

        assertThat(limiter.remainingLock("ANA")).contains(Duration.ofMinutes(8));
    }
}
