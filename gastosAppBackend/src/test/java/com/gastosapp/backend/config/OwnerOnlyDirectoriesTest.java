package com.gastosapp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class OwnerOnlyDirectoriesTest {

    @TempDir
    Path root;

    private static String permissions(Path path) throws IOException {
        return PosixFilePermissions.toString(Files.getPosixFilePermissions(path));
    }

    @Test
    void aDirectoryCreatedByTheAppIsOwnerOnly() throws IOException {
        Path dir = OwnerOnlyDirectories.ensure(root.resolve("a/b/data"));

        assertThat(dir).isDirectory();
        assertThat(permissions(dir)).isEqualTo("rwx------");
    }

    @Test
    void anExistingDirectoryKeepsItsPermissions() throws IOException {
        Path dir = Files.createDirectory(root.resolve("data"));
        Files.setPosixFilePermissions(dir, PosixFilePermissions.fromString("rwxr-xr-x"));

        OwnerOnlyDirectories.ensure(dir);

        assertThat(permissions(dir)).isEqualTo("rwxr-xr-x");
    }

    @Test
    void filesCanBeRestrictedToTheOwner() throws IOException {
        Path file = Files.createFile(root.resolve("backup.db"));
        Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-r--r--"));

        OwnerOnlyDirectories.restrictFile(file);

        assertThat(permissions(file)).isEqualTo("rw-------");
    }
}
