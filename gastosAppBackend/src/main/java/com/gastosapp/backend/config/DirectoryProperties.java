package com.gastosapp.backend.config;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Directories of spec section 8. {@code data} holds gastos.db, jwt-secret and
 * backups/ ({@code GASTOS_DATA_DIR}); {@code frontend} is the compiled frontend
 * served by the backend ({@code GASTOS_FRONTEND_DIR}). The defaults are
 * relative to the backend module folder (see {@link BackendLocation}); relative
 * values given explicitly are resolved against the working directory.
 */
@ConfigurationProperties("app.dirs")
public record DirectoryProperties(String data, String frontend) {

    public static final String DATABASE_FILE = "gastos.db";

    public static final String JWT_SECRET_FILE = "jwt-secret";

    public static final String BACKUPS_DIR = "backups";

    public Path dataDir() {
        return Path.of(data).toAbsolutePath().normalize();
    }

    public Path frontendDir() {
        return Path.of(frontend).toAbsolutePath().normalize();
    }
}
