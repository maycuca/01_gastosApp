package com.gastosapp.backend.backup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

import com.gastosapp.backend.api.MutableClock;
import com.gastosapp.backend.config.DirectoryProperties;
import com.zaxxer.hikari.HikariDataSource;

/** Spec section 8 (Respaldos), against a temporary data directory. */
class BackupServiceTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 18);

    @TempDir
    Path dataDir;

    private final MutableClock clock = new MutableClock(ZoneId.systemDefault());
    private HikariDataSource dataSource;
    private BackupService service;

    @BeforeEach
    void setUp() throws Exception {
        clock.setDate(TODAY);
        SQLiteConfig config = new SQLiteConfig();
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        SQLiteDataSource sqlite = new SQLiteDataSource(config);
        sqlite.setUrl("jdbc:sqlite:" + dataDir.resolve("gastos.db"));
        dataSource = new HikariDataSource();
        dataSource.setDataSource(sqlite);
        dataSource.setMaximumPoolSize(1); // same as the application
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("create table expenses (id integer primary key, description text)");
            statement.execute("insert into expenses (description) values ('Almuerzo'), ('Taxi')");
        }
        service = new BackupService(dataSource, clock,
                new DirectoryProperties(dataDir.toString(), dataDir.resolve("web").toString()), true, 14,
                Duration.ofHours(24));
    }

    @AfterEach
    void tearDown() {
        service.stop();
        dataSource.close();
    }

    private Path backups() {
        return dataDir.resolve("backups");
    }

    private List<String> backupNames() throws Exception {
        try (Stream<Path> files = Files.list(backups())) {
            return files.map(file -> file.getFileName().toString()).sorted().toList();
        }
    }

    private static List<String> descriptions(Path database) throws Exception {
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database);
                Statement statement = connection.createStatement();
                ResultSet rows = statement.executeQuery("select description from expenses order by id")) {
            List<String> result = new java.util.ArrayList<>();
            while (rows.next()) {
                result.add(rows.getString(1));
            }
            return result;
        }
    }

    @Test
    void createsTodaysBackupWithTheDatabaseContent() throws Exception {
        assertThat(service.backupIfMissing()).contains(backups().resolve("gastos-2026-11-18.db"));

        assertThat(backupNames()).containsExactly("gastos-2026-11-18.db");
        assertThat(descriptions(backups().resolve("gastos-2026-11-18.db"))).containsExactly("Almuerzo", "Taxi");
    }

    @Test
    void theBackupIsAConsistentCopyIncludingDataStillInTheWal() throws Exception {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("insert into expenses (description) values ('Recién escrito')");
        }

        service.backupIfMissing();

        assertThat(descriptions(backups().resolve("gastos-2026-11-18.db")))
                .containsExactly("Almuerzo", "Taxi", "Recién escrito");
    }

    @Test
    void anExistingBackupOfTheDayIsNotReplaced() throws Exception {
        service.backupIfMissing();
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("insert into expenses (description) values ('Después')");
        }

        assertThat(service.backupIfMissing()).isEmpty();

        assertThat(descriptions(backups().resolve("gastos-2026-11-18.db"))).containsExactly("Almuerzo", "Taxi");
    }

    @Test
    void aNewDayGetsItsOwnBackup() throws Exception {
        service.backupIfMissing();
        clock.setDate(TODAY.plusDays(1));

        service.backupIfMissing();

        assertThat(backupNames()).containsExactly("gastos-2026-11-18.db", "gastos-2026-11-19.db");
    }

    @Test
    void onlyTheFourteenMostRecentBackupsAreKept() throws Exception {
        Files.createDirectories(backups());
        for (int day = 1; day <= 20; day++) {
            Files.writeString(backups().resolve(BackupService.fileName(LocalDate.of(2026, 10, day))), "viejo");
        }
        Files.writeString(backups().resolve("notas.txt"), "no es un respaldo");

        service.backupIfMissing();

        List<String> names = backupNames();
        assertThat(names).hasSize(15).contains("notas.txt", "gastos-2026-11-18.db");
        assertThat(names.stream().filter(name -> name.startsWith("gastos-"))).hasSize(14)
                .contains("gastos-2026-10-08.db", "gastos-2026-10-20.db")
                .doesNotContain("gastos-2026-10-07.db", "gastos-2026-10-01.db");
    }

    @Test
    void pruningAlsoRunsWhenTodaysBackupAlreadyExists() throws Exception {
        Files.createDirectories(backups());
        for (int day = 1; day <= 18; day++) {
            Files.writeString(backups().resolve(BackupService.fileName(LocalDate.of(2026, 11, day))), "x");
        }

        assertThat(service.backupIfMissing()).isEmpty();

        assertThat(backupNames()).hasSize(14).first().isEqualTo("gastos-2026-11-05.db");
    }

    @Test
    void aLeftoverPartialFileDoesNotBlockTheBackup() throws Exception {
        Files.createDirectories(backups());
        Files.writeString(backups().resolve(".gastos-2026-11-18.db.partial"), "a medias");

        service.backupIfMissing();

        assertThat(backupNames()).containsExactly("gastos-2026-11-18.db");
        assertThat(descriptions(backups().resolve("gastos-2026-11-18.db"))).containsExactly("Almuerzo", "Taxi");
    }

    @Test
    void aFailureIsReportedAndBackupSafelyDoesNotThrow() throws Exception {
        Files.writeString(backups(), "un archivo donde debería haber un directorio");

        assertThatThrownBy(() -> service.backupIfMissing()).isInstanceOf(java.io.IOException.class);
        assertThat(service.backupSafely()).isFalse();
    }

    @Test
    void theApplicationStillWorksAfterABackupOnTheSingleConnection() throws Exception {
        service.backupIfMissing();

        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement();
                ResultSet rows = statement.executeQuery("select count(*) from expenses")) {
            rows.next();
            assertThat(rows.getInt(1)).isEqualTo(2);
        }
    }
}
