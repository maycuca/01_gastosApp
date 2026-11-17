package com.gastosapp.backend.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.EnumSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Directories with personal data (the data directory and its backups/): created
 * by the application with permissions 700. An existing directory is never
 * changed; if group or others have any access a warning is logged (once per
 * directory). On file systems without POSIX permissions only the creation is done.
 */
public final class OwnerOnlyDirectories {

    public static final Set<PosixFilePermission> DIRECTORY = PosixFilePermissions.fromString("rwx------");

    public static final Set<PosixFilePermission> FILE = PosixFilePermissions.fromString("rw-------");

    private static final Set<PosixFilePermission> GROUP_OR_OTHERS = EnumSet.of(
            PosixFilePermission.GROUP_READ, PosixFilePermission.GROUP_WRITE, PosixFilePermission.GROUP_EXECUTE,
            PosixFilePermission.OTHERS_READ, PosixFilePermission.OTHERS_WRITE, PosixFilePermission.OTHERS_EXECUTE);

    private static final Logger log = LoggerFactory.getLogger(OwnerOnlyDirectories.class);

    private static final Set<Path> warned = ConcurrentHashMap.newKeySet();

    private OwnerOnlyDirectories() {
    }

    /** Creates {@code dir} (and missing parents) with 700 on the directory itself, or checks the existing one. */
    public static Path ensure(Path dir) throws IOException {
        Path absolute = dir.toAbsolutePath().normalize();
        if (Files.isDirectory(absolute)) {
            warnIfShared(absolute);
            return absolute;
        }
        Path parent = absolute.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        try {
            if (isPosix(absolute)) {
                Files.createDirectory(absolute, PosixFilePermissions.asFileAttribute(DIRECTORY));
                // The umask cannot widen the permissions given at creation, but set them explicitly anyway.
                Files.setPosixFilePermissions(absolute, DIRECTORY);
            } else {
                Files.createDirectory(absolute);
            }
            log.info("Created directory {} (owner-only access)", absolute);
        } catch (java.nio.file.FileAlreadyExistsException ex) {
            // Created concurrently: treat it as an existing directory.
            warnIfShared(absolute);
        }
        return absolute;
    }

    /** Restricts a file written by the application (backups) to its owner. */
    public static void restrictFile(Path file) throws IOException {
        if (isPosix(file)) {
            Files.setPosixFilePermissions(file, FILE);
        }
    }

    private static void warnIfShared(Path dir) throws IOException {
        if (!isPosix(dir)) {
            return;
        }
        Set<PosixFilePermission> permissions = Files.getPosixFilePermissions(dir);
        if (permissions.stream().anyMatch(GROUP_OR_OTHERS::contains) && warned.add(dir)) {
            log.warn("Directory {} has permissions {}; other users of this machine may read your data. "
                    + "Consider: chmod 700 {}", dir, PosixFilePermissions.toString(permissions), dir);
        }
    }

    static boolean isPosix(Path path) {
        return path.toAbsolutePath().getFileSystem().supportedFileAttributeViews().contains("posix");
    }
}
