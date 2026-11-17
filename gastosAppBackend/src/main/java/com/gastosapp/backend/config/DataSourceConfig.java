package com.gastosapp.backend.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Locale;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.sqlite.Function;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteConnection;
import org.sqlite.SQLiteDataSource;

import com.zaxxer.hikari.HikariDataSource;

/**
 * SQLite data source: WAL journal mode, foreign keys enforced, and a HikariCP
 * pool whose size comes from {@code spring.datasource.hikari.maximum-pool-size} (1).
 */
@Configuration
public class DataSourceConfig {

    /** SQL function registered on every connection; SQLite's own lower() only handles ASCII. */
    public static final String UNICODE_LOWER = "unicode_lower";

    private static final String URL_PREFIX = "jdbc:sqlite:";

    @Bean
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariDataSource dataSource(@Value("${spring.datasource.url}") String url,
            DirectoryProperties directories) throws IOException {
        createParentDirectory(url, directories.dataDir());

        SQLiteConfig config = new SQLiteConfig();
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        config.enforceForeignKeys(true);
        config.setBusyTimeout(5000);

        SQLiteDataSource sqlite = new SQLiteDataSource(config);
        sqlite.setUrl(url);

        HikariDataSource hikari = new HikariDataSource();
        hikari.setDataSource(new FunctionRegisteringDataSource(sqlite));
        return hikari;
    }

    /** The data directory itself is created owner-only (700); any other location is created as usual. */
    private static void createParentDirectory(String url, Path dataDir) throws IOException {
        if (!url.startsWith(URL_PREFIX)) {
            return;
        }
        String file = url.substring(URL_PREFIX.length());
        int query = file.indexOf('?');
        if (query >= 0) {
            file = file.substring(0, query);
        }
        if (file.isEmpty() || file.startsWith(":") || file.startsWith("file:")) {
            return;
        }
        Path parent = Path.of(file).toAbsolutePath().normalize().getParent();
        if (parent == null) {
            return;
        }
        if (parent.equals(dataDir)) {
            OwnerOnlyDirectories.ensure(parent);
        } else {
            Files.createDirectories(parent);
        }
    }

    private static final class FunctionRegisteringDataSource extends DelegatingDataSource {

        FunctionRegisteringDataSource(DataSource target) {
            super(target);
        }

        @Override
        public Connection getConnection() throws SQLException {
            return register(super.getConnection());
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            return register(super.getConnection(username, password));
        }

        private static Connection register(Connection connection) throws SQLException {
            if (connection instanceof SQLiteConnection) {
                Function.create(connection, UNICODE_LOWER, new Function() {
                    @Override
                    protected void xFunc() throws SQLException {
                        String value = value_text(0);
                        if (value == null) {
                            result();
                        } else {
                            result(value.toLowerCase(Locale.ROOT));
                        }
                    }
                }, 1, Function.FLAG_DETERMINISTIC);
            }
            return connection;
        }
    }
}
