package com.gastosapp.backend.security;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileAttribute;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.gastosapp.backend.config.OwnerOnlyDirectories;

/**
 * Source of the JWT signing secret (spec section 1). {@code JWT_SECRET} wins when
 * set; otherwise a random secret is generated on first start, stored in
 * {@code <data dir>/jwt-secret} readable only by the owner, and reused afterwards.
 */
public final class JwtSecretStore {

    /** HS256 needs a key of at least 256 bits. */
    public static final int MIN_SECRET_BYTES = 32;

    private static final int GENERATED_SECRET_BYTES = 64;

    private static final Set<PosixFilePermission> OWNER_ONLY = PosixFilePermissions.fromString("rw-------");

    private static final Logger log = LoggerFactory.getLogger(JwtSecretStore.class);

    private JwtSecretStore() {
    }

    /** Returns the secret bytes: {@code configured} when not blank, else the content of {@code secretFile}. */
    public static byte[] resolve(String configured, Path secretFile) {
        if (configured != null && !configured.isBlank()) {
            return requireLength(configured.getBytes(StandardCharsets.UTF_8), "JWT_SECRET");
        }
        try {
            if (!Files.exists(secretFile)) {
                createSecretFile(secretFile);
            }
            return readSecretFile(secretFile);
        } catch (IOException ex) {
            throw new UncheckedIOException("Cannot read or create the JWT secret file " + secretFile, ex);
        }
    }

    private static void createSecretFile(Path secretFile) throws IOException {
        OwnerOnlyDirectories.ensure(secretFile.toAbsolutePath().getParent());
        byte[] random = new byte[GENERATED_SECRET_BYTES];
        new SecureRandom().nextBytes(random);
        byte[] content = Base64.getUrlEncoder().withoutPadding().encodeToString(random)
                .getBytes(StandardCharsets.US_ASCII);
        boolean posix = isPosix(secretFile);
        FileAttribute<?>[] attributes = posix
                ? new FileAttribute<?>[] {PosixFilePermissions.asFileAttribute(OWNER_ONLY)}
                : new FileAttribute<?>[0];
        try (SeekableByteChannel channel = Files.newByteChannel(secretFile,
                Set.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE), attributes)) {
            channel.write(ByteBuffer.wrap(content));
        } catch (FileAlreadyExistsException ex) {
            return; // Created concurrently by another process: use that one.
        }
        if (posix) {
            // The umask cannot widen the permissions given at creation, but set them explicitly anyway.
            Files.setPosixFilePermissions(secretFile, OWNER_ONLY);
        }
        log.info("Generated a new JWT secret in {}", secretFile);
    }

    private static byte[] readSecretFile(Path secretFile) throws IOException {
        if (isPosix(secretFile) && !Files.getPosixFilePermissions(secretFile).equals(OWNER_ONLY)) {
            log.warn("JWT secret file {} was readable by others; restricting it to the owner", secretFile);
            Files.setPosixFilePermissions(secretFile, OWNER_ONLY);
        }
        String content = Files.readString(secretFile, StandardCharsets.UTF_8).strip();
        return requireLength(content.getBytes(StandardCharsets.UTF_8), secretFile.toString());
    }

    private static byte[] requireLength(byte[] secret, String source) {
        if (secret.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "The JWT secret from " + source + " must be at least " + MIN_SECRET_BYTES + " bytes long");
        }
        return secret;
    }

    private static boolean isPosix(Path file) {
        return file.toAbsolutePath().getFileSystem().supportedFileAttributeViews().contains("posix");
    }
}
