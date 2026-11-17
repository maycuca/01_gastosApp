package com.gastosapp.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Limit on wrong {@code currentPassword} values in PUT /api/auth/password, per
 * user: after {@value #MAX_FAILURES} consecutive failures the endpoint answers
 * 429 with {@code Retry-After} for {@link #LOCK_DURATION} without checking the
 * password. A successful change resets the counter. A stolen token therefore
 * cannot be used to guess the password by brute force.
 */
@Component
public class PasswordChangeAttemptLimiter extends AttemptLimiter {

    public PasswordChangeAttemptLimiter(Clock clock,
            @Value("${app.login.max-tracked-usernames:10000}") int maxTrackedUsers) {
        super(clock, maxTrackedUsers);
    }

    public Optional<Duration> remainingLock(Long userId) {
        return remainingLock(String.valueOf(userId));
    }

    public void recordFailure(Long userId) {
        recordFailure(String.valueOf(userId));
    }

    public void recordSuccess(Long userId) {
        recordSuccess(String.valueOf(userId));
    }
}
