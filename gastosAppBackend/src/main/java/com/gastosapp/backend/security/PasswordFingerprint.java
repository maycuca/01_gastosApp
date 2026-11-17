package com.gastosapp.backend.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Value of the {@code pwd} claim: the first 16 hex characters of the SHA-256 of
 * the user's current BCrypt hash. Any password change (from the Cuenta page or
 * with reset-password.sh) changes the hash and therefore invalidates every token
 * issued before it. It reveals nothing usable about the password.
 */
public final class PasswordFingerprint {

    static final int LENGTH = 16;

    private PasswordFingerprint() {
    }

    public static String of(String passwordHash) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(passwordHash.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest).substring(0, LENGTH);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    /** Constant-time comparison of a token's {@code pwd} claim with the fingerprint of {@code passwordHash}. */
    public static boolean matches(String claim, String passwordHash) {
        return claim != null && MessageDigest.isEqual(claim.getBytes(StandardCharsets.US_ASCII),
                of(passwordHash).getBytes(StandardCharsets.US_ASCII));
    }
}
