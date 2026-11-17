package com.gastosapp.backend.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.gastosapp.backend.config.DirectoryProperties;
import com.gastosapp.backend.config.JwtProperties;

/** Spec section 1: JWT secret from JWT_SECRET, else generated once into &lt;data dir&gt;/jwt-secret. */
class JwtSecretStoreTest {

    @TempDir
    Path dataDir;

    private Path secretFile() {
        return dataDir.resolve("jwt-secret");
    }

    @Test
    void withoutConfiguredSecretOneIsGeneratedWithOwnerOnlyPermissions() throws Exception {
        byte[] secret = JwtSecretStore.resolve("", secretFile());

        assertThat(secret.length).isGreaterThanOrEqualTo(JwtSecretStore.MIN_SECRET_BYTES);
        assertThat(Files.readString(secretFile()).getBytes(StandardCharsets.UTF_8)).isEqualTo(secret);
        assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(secretFile()))).isEqualTo("rw-------");
    }

    @Test
    void theGeneratedSecretIsReusedOnTheNextStart() {
        byte[] first = JwtSecretStore.resolve(null, secretFile());
        byte[] second = JwtSecretStore.resolve("  ", secretFile());

        assertThat(second).isEqualTo(first);
    }

    @Test
    void eachDataDirectoryGetsItsOwnRandomSecret(@TempDir Path otherDir) {
        byte[] first = JwtSecretStore.resolve(null, secretFile());
        byte[] other = JwtSecretStore.resolve(null, otherDir.resolve("jwt-secret"));

        assertThat(other).isNotEqualTo(first);
    }

    @Test
    void theDataDirectoryIsCreatedIfMissing() {
        Path nested = dataDir.resolve("a").resolve("b").resolve("jwt-secret");

        JwtSecretStore.resolve(null, nested);

        assertThat(nested).exists();
    }

    @Test
    void aConfiguredSecretWinsAndNoFileIsWritten() {
        String configured = "un-secreto-configurado-de-al-menos-32-bytes";

        byte[] secret = JwtSecretStore.resolve(configured, secretFile());

        assertThat(secret).isEqualTo(configured.getBytes(StandardCharsets.UTF_8));
        assertThat(secretFile()).doesNotExist();
    }

    @Test
    void aShortConfiguredSecretIsRejected() {
        assertThatThrownBy(() -> JwtSecretStore.resolve("corto", secretFile()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("32 bytes");
    }

    @Test
    void aShortSecretFileIsRejected() throws Exception {
        Files.writeString(secretFile(), "corto");

        assertThatThrownBy(() -> JwtSecretStore.resolve(null, secretFile()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("32 bytes");
    }

    @Test
    void anExistingFileReadableByOthersIsRestrictedToTheOwner() throws Exception {
        Files.writeString(secretFile(), "x".repeat(40));
        Files.setPosixFilePermissions(secretFile(), PosixFilePermissions.fromString("rw-r--r--"));

        JwtSecretStore.resolve(null, secretFile());

        assertThat(PosixFilePermissions.toString(Files.getPosixFilePermissions(secretFile()))).isEqualTo("rw-------");
    }

    @Test
    void tokensIssuedBeforeARestartAreStillValidAfterIt() {
        JwtProperties properties = new JwtProperties("", Duration.ofHours(24));
        DirectoryProperties directories = new DirectoryProperties(dataDir.toString(), dataDir.resolve("fe").toString());
        String token = new JwtService(properties, directories, Clock.systemDefaultZone()).issue(7L, "ana", "$2a$10$hash");

        JwtService afterRestart = new JwtService(properties, directories, Clock.systemDefaultZone());

        assertThat(afterRestart.verify(token)).map(JwtService.VerifiedToken::userId).contains(7L);
    }

    @Test
    void tokensFromAnotherInstallationAreRejected(@TempDir Path otherDir) {
        JwtProperties properties = new JwtProperties("", Duration.ofHours(24));
        String token = new JwtService(properties,
                new DirectoryProperties(dataDir.toString(), "fe"), Clock.systemDefaultZone()).issue(7L, "ana", "$2a$10$hash");

        JwtService other = new JwtService(properties,
                new DirectoryProperties(otherDir.toString(), "fe"), Clock.systemDefaultZone());

        assertThat(other.verify(token)).isEmpty();
    }
}
