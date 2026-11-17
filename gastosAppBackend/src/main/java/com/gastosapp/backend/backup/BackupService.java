package com.gastosapp.backend.backup;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import com.gastosapp.backend.config.DirectoryProperties;
import com.gastosapp.backend.config.OwnerOnlyDirectories;

import jakarta.annotation.PreDestroy;

/**
 * Automatic backups of spec section 8. On startup and every 24 hours, if today's
 * backup does not exist yet, a consistent copy of the database is written to
 * {@code <data dir>/backups/gastos-YYYY-MM-DD.db} with {@code VACUUM INTO}; only
 * the 14 most recent backups are kept. A failure is logged and never stops the
 * application. The backups directory is created with permissions 700 and each
 * backup file with 600.
 *
 * <p>{@code VACUUM INTO} runs on the pool's single connection, so requests wait
 * for it (a fraction of a second for a household database) instead of competing
 * for a second connection.
 */
@Service
public class BackupService {

    private static final Logger log = LoggerFactory.getLogger(BackupService.class);

    private static final Pattern BACKUP_NAME = Pattern.compile("gastos-\\d{4}-\\d{2}-\\d{2}\\.db");

    private final DataSource dataSource;
    private final Clock clock;
    private final Path backupsDir;
    private final boolean enabled;
    private final int keep;
    private final Duration interval;
    private ScheduledExecutorService scheduler;

    public BackupService(DataSource dataSource, Clock clock, DirectoryProperties directories,
            @Value("${app.backup.enabled:true}") boolean enabled,
            @Value("${app.backup.keep:14}") int keep,
            @Value("${app.backup.interval:24h}") Duration interval) {
        if (keep < 1) {
            throw new IllegalArgumentException("app.backup.keep must be positive");
        }
        this.dataSource = dataSource;
        this.clock = clock;
        this.backupsDir = directories.dataDir().resolve(DirectoryProperties.BACKUPS_DIR);
        this.enabled = enabled;
        this.keep = keep;
        this.interval = interval;
    }

    public static String fileName(LocalDate date) {
        return "gastos-" + date + ".db";
    }

    public Path backupsDir() {
        return backupsDir;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        if (!enabled) {
            return;
        }
        backupSafely();
        scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofVirtual().name("gastos-backup").factory());
        long millis = interval.toMillis();
        scheduler.scheduleAtFixedRate(this::backupSafely, millis, millis, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    public void stop() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
    }

    /** Like {@link #backupIfMissing()} but logs failures instead of throwing them. */
    public boolean backupSafely() {
        try {
            backupIfMissing();
            return true;
        } catch (Exception ex) {
            log.error("Automatic backup into {} failed", backupsDir, ex);
            return false;
        }
    }

    /**
     * Creates today's backup when it does not exist and prunes the old ones.
     *
     * @return the backup created now, or empty when today's already existed
     */
    public synchronized Optional<Path> backupIfMissing() throws IOException, SQLException {
        OwnerOnlyDirectories.ensure(backupsDir);
        Path target = backupsDir.resolve(fileName(LocalDate.now(clock)));
        Optional<Path> created = Optional.empty();
        if (!Files.exists(target)) {
            // Written under a temporary name and renamed, so a half-written file never counts as today's backup.
            Path partial = backupsDir.resolve("." + target.getFileName() + ".partial");
            Files.deleteIfExists(partial);
            try (Connection connection = dataSource.getConnection();
                    PreparedStatement statement = connection.prepareStatement("VACUUM INTO ?")) {
                statement.setString(1, partial.toString());
                statement.execute();
            } catch (SQLException ex) {
                Files.deleteIfExists(partial);
                throw ex;
            }
            OwnerOnlyDirectories.restrictFile(partial);
            Files.move(partial, target, StandardCopyOption.ATOMIC_MOVE);
            log.info("Backup created: {}", target);
            created = Optional.of(target);
        }
        prune();
        return created;
    }

    /** Deletes every backup except the {@code keep} most recent ones (by the date in the name). */
    private void prune() throws IOException {
        List<Path> backups = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(backupsDir,
                file -> Files.isRegularFile(file) && BACKUP_NAME.matcher(file.getFileName().toString()).matches())) {
            stream.forEach(backups::add);
        }
        backups.sort(Comparator.comparing((Path file) -> file.getFileName().toString()).reversed());
        for (Path old : backups.subList(Math.min(keep, backups.size()), backups.size())) {
            Files.deleteIfExists(old);
            log.info("Old backup deleted: {}", old);
        }
    }
}
