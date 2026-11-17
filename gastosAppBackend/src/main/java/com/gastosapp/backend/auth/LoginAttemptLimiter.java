package com.gastosapp.backend.auth;

import java.time.Clock;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Login attempt limit of spec section 1, per username (case-insensitive,
 * surrounding spaces ignored). Usernames that do not exist count too, so the
 * answer does not reveal whether an account exists.
 */
@Component
public class LoginAttemptLimiter extends AttemptLimiter {

    public LoginAttemptLimiter(Clock clock,
            @Value("${app.login.max-tracked-usernames:10000}") int maxTrackedUsernames) {
        super(clock, maxTrackedUsernames);
    }

    /** Same normalization as the username itself: surrounding spaces ignored, case-insensitive. */
    @Override
    protected String key(String username) {
        return username.strip().toLowerCase(Locale.ROOT);
    }
}
