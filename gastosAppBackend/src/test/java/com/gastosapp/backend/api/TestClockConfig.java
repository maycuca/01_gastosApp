package com.gastosapp.backend.api;

import java.time.ZoneId;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Replaces the application's system clock with one the tests can move. */
@TestConfiguration
public class TestClockConfig {

    @Bean
    @Primary
    public MutableClock testClock() {
        return new MutableClock(ZoneId.systemDefault());
    }
}
