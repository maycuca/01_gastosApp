package com.gastosapp.backend.config;

import java.time.Clock;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.validation.autoconfigure.ValidationConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({JwtProperties.class, DirectoryProperties.class})
public class AppConfig {

    /** Source of "today" for the whole application (server time zone). */
    @Bean
    public Clock clock() {
        return Clock.systemDefaultZone();
    }

    /** Makes Bean Validation (@PastOrPresent, ...) use the same injectable clock. */
    @Bean
    public ValidationConfigurationCustomizer validationClock(Clock clock) {
        return configuration -> configuration.clockProvider(() -> clock);
    }
}
