package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

import com.zaxxer.hikari.HikariDataSource;

/** Spec section 7: SQLite in WAL mode with a pool of 1 connection; tests never use the real database. */
class PersistenceConfigTest extends ApiTestSupport {

    @Autowired
    private HikariDataSource dataSource;

    @Value("${spring.datasource.url}")
    private String url;

    @Test
    void testsRunAgainstAThrowawayDatabase() {
        assertThat(url).startsWith("jdbc:sqlite:target/test-db/").doesNotContain("data/gastos.db");
    }

    @Test
    void sqliteRunsInWalModeWithForeignKeys() {
        assertThat(jdbc.queryForObject("PRAGMA journal_mode", String.class)).isEqualToIgnoringCase("wal");
        assertThat(jdbc.queryForObject("PRAGMA foreign_keys", Integer.class)).isEqualTo(1);
    }

    @Test
    void connectionPoolHasASingleConnection() {
        assertThat(dataSource.getMaximumPoolSize()).isEqualTo(1);
    }
}
