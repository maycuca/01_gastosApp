package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Spec section 8: a backup failure is logged and does not prevent the application from starting. */
class BackupFailureStartupTest extends ApiTestSupport {

    private static final Path DATA_DIR = createDataDirWhereBackupsCannotBeWritten();

    private static Path createDataDirWhereBackupsCannotBeWritten() {
        try {
            Path dir = Path.of("target", "test-db", "backup-failure-" + UUID.randomUUID()).toAbsolutePath();
            Files.createDirectories(dir);
            // "backups" is a regular file, so the backup directory cannot be created.
            Files.writeString(dir.resolve("backups"), "no es un directorio");
            return dir;
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("app.dirs.data", DATA_DIR::toString);
        registry.add("app.backup.enabled", () -> "true");
    }

    @Test
    void theApplicationStartsAndServesTheApi() throws Exception {
        Session session = register();

        doGet(session, "/api/categories").expect(200);
        assertThat(DATA_DIR.resolve("backups")).isRegularFile();
    }
}
