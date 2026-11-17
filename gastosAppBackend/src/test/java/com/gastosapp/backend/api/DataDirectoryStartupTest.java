package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.gastosapp.backend.config.DirectoryProperties;
import com.gastosapp.backend.config.JwtProperties;
import com.gastosapp.backend.security.JwtService;

/**
 * Spec sections 1 and 8 with the production layout of the data directory:
 * no JWT_SECRET, database, jwt-secret and backups/ all inside a temporary
 * GASTOS_DATA_DIR, and today's backup created on startup.
 */
class DataDirectoryStartupTest extends ApiTestSupport {

    private static final Path DATA_DIR = Path.of("target", "test-db", "data-dir-" + UUID.randomUUID())
            .toAbsolutePath();

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("app.dirs.data", DATA_DIR::toString);
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:${app.dirs.data}/gastos.db");
        registry.add("app.jwt.secret", () -> "");
        registry.add("app.backup.enabled", () -> "true");
    }

    @Value("${spring.datasource.url}")
    private String url;

    @Test
    void theDatabaseLivesInTheDataDirectory() {
        assertThat(url).isEqualTo("jdbc:sqlite:" + DATA_DIR + "/gastos.db");
        assertThat(DATA_DIR.resolve("gastos.db")).exists();
    }

    @Test
    void theDataDirectoryCreatedByTheAppIsOwnerOnly() throws Exception {
        assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(DATA_DIR))).isEqualTo("rwx------");
        assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(DATA_DIR.resolve("backups"))))
                .isEqualTo("rwx------");
    }

    @Test
    void backupsAreOwnerOnly() throws Exception {
        try (Stream<Path> files = Files.list(DATA_DIR.resolve("backups"))) {
            assertThat(files.toList()).isNotEmpty().allSatisfy(file -> assertThat(
                    PosixFilePermissions.toString(Files.getPosixFilePermissions(file))).isEqualTo("rw-------"));
        }
    }

    @Test
    void withoutJwtSecretAnOwnerOnlySecretFileIsGenerated() throws Exception {
        Path secret = DATA_DIR.resolve("jwt-secret");

        assertThat(secret).exists();
        assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(secret))).isEqualTo("rw-------");
        assertThat(Files.readString(secret).strip().length()).isGreaterThanOrEqualTo(32);
    }

    @Test
    void tokensKeepWorkingWithTheSecretReloadedAfterARestart() throws Exception {
        Session session = register();

        JwtService restarted = new JwtService(new JwtProperties("", Duration.ofHours(24)),
                new DirectoryProperties(DATA_DIR.toString(), "fe"), Clock.systemDefaultZone());

        assertThat(restarted.verify(session.token())).map(JwtService.VerifiedToken::userId)
                .contains(session.userId());
        doGet(session, "/api/auth/me").expect(200);
    }

    @Test
    void todaysBackupIsCreatedOnStartup() throws Exception {
        List<String> backups;
        try (Stream<Path> files = Files.list(DATA_DIR.resolve("backups"))) {
            backups = files.map(file -> file.getFileName().toString()).toList();
        }

        assertThat(backups).hasSize(1);
        assertThat(backups.get(0)).matches("gastos-\\d{4}-\\d{2}-\\d{2}\\.db");
    }
}
