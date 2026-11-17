package com.gastosapp.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Consecutive failure limit shared by the login and the password change: after
 * {@value #MAX_FAILURES} consecutive failures for a key further attempts are
 * rejected for {@link #LOCK_DURATION} without checking the password (the caller
 * asks {@link #remainingLock} before running BCrypt). A success resets the
 * counter. State lives in memory only.
 *
 * <p>The map is bounded: when it is full, expired locks are dropped first, then
 * the counters that are not locked (oldest failure first) and, only if every
 * tracked key is locked, the lock that ends soonest. Keys invented by an
 * attacker therefore cannot make it grow without limit.
 */
public abstract class AttemptLimiter {

    public static final int MAX_FAILURES = 5;

    public static final Duration LOCK_DURATION = Duration.ofMinutes(15);

    private final Clock clock;
    private final int maxTrackedUsernames;
    private final Map<String, Attempts> attempts = new HashMap<>();

    protected AttemptLimiter(Clock clock, int maxTrackedUsernames) {
        if (maxTrackedUsernames < 1) {
            throw new IllegalArgumentException("The maximum number of tracked keys must be positive");
        }
        this.clock = clock;
        this.maxTrackedUsernames = maxTrackedUsernames;
    }

    /** Failures so far and, once the limit is reached, the end of the lock. */
    private record Attempts(int failures, Instant lastFailure, Instant lockedUntil) {

        boolean lockedAt(Instant now) {
            return lockedUntil != null && now.isBefore(lockedUntil);
        }

        boolean lockExpiredAt(Instant now) {
            return lockedUntil != null && !now.isBefore(lockedUntil);
        }
    }

    /** Remaining lock time for {@code username}, or empty when an attempt is allowed. */
    public synchronized Optional<Duration> remainingLock(String username) {
        String key = key(username);
        Instant now = clock.instant();
        Attempts current = attempts.get(key);
        if (current == null) {
            return Optional.empty();
        }
        if (current.lockExpiredAt(now)) {
            // The lock is over: the user starts again with a clean counter.
            attempts.remove(key);
            return Optional.empty();
        }
        return current.lockedAt(now) ? Optional.of(Duration.between(now, current.lockedUntil())) : Optional.empty();
    }

    public synchronized void recordFailure(String username) {
        String key = key(username);
        Instant now = clock.instant();
        Attempts current = attempts.get(key);
        if (current == null || current.lockExpiredAt(now)) {
            if (current == null && attempts.size() >= maxTrackedUsernames) {
                evict(now);
            }
            current = new Attempts(0, now, null);
        }
        int failures = current.failures() + 1;
        Instant lockedUntil = failures >= MAX_FAILURES ? now.plus(LOCK_DURATION) : null;
        attempts.put(key, new Attempts(failures, now, lockedUntil));
    }

    public synchronized void recordSuccess(String username) {
        attempts.remove(key(username));
    }

    synchronized int trackedUsernames() {
        return attempts.size();
    }

    private void evict(Instant now) {
        attempts.values().removeIf(entry -> entry.lockExpiredAt(now));
        if (attempts.size() < maxTrackedUsernames) {
            return;
        }
        Optional<String> oldestUnlocked = attempts.entrySet().stream()
                .filter(entry -> !entry.getValue().lockedAt(now))
                .min(Comparator.comparing(entry -> entry.getValue().lastFailure()))
                .map(Map.Entry::getKey);
        String victim = oldestUnlocked.orElseGet(() -> attempts.entrySet().stream()
                .min(Comparator.comparing(entry -> entry.getValue().lockedUntil()))
                .map(Map.Entry::getKey)
                .orElseThrow());
        attempts.remove(victim);
    }

    /** Normalization of the keys; identity unless a subclass says otherwise. */
    protected String key(String rawKey) {
        return rawKey;
    }
}
