package com.gastosapp.backend.auth;

import java.text.Normalizer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    /** Password rule shared by registration and password change. */
    static final int PASSWORD_MIN_LENGTH = 8;

    static final int USERNAME_MAX_LENGTH = 30;

    /** BCrypt only uses the first 72 bytes; a longer text has at least 73 bytes, so this cap is exact. */
    static final int PASSWORD_MAX_BYTES = 72;

    static final String PASSWORD_TOO_LONG = "Debe tener como máximo 72 bytes";

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank(message = "Campo obligatorio")
            @Size(min = 3, max = 30, message = "Debe tener entre 3 y 30 caracteres")
            String username,

            @NotBlank(message = "Campo obligatorio")
            @Size(min = PASSWORD_MIN_LENGTH, message = "Debe tener al menos 8 caracteres")
            String password) {

        public RegisterRequest {
            username = strip(username);
        }
    }

    /**
     * Length caps keep BCrypt away from huge inputs; violations are 400 and do
     * not count for the login attempt limit (they never reach the check).
     */
    public record LoginRequest(
            @NotBlank(message = "Campo obligatorio")
            @Size(max = USERNAME_MAX_LENGTH, message = "Debe tener como máximo 30 caracteres")
            String username,

            @NotBlank(message = "Campo obligatorio")
            @Size(max = PASSWORD_MAX_BYTES, message = PASSWORD_TOO_LONG)
            String password) {

        public LoginRequest {
            username = strip(username);
        }
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "Campo obligatorio") String currentPassword,

            @NotBlank(message = "Campo obligatorio")
            @Size(min = PASSWORD_MIN_LENGTH, message = "Debe tener al menos 8 caracteres")
            String newPassword) {
    }

    /**
     * Usernames ignore surrounding whitespace, so " ana " and "ana" are the same
     * account, and are kept in Unicode NFC, so "José" typed with a combining
     * accent is the same account as with the precomposed "é".
     */
    static String strip(String username) {
        return username == null ? null : Normalizer.normalize(username.strip(), Normalizer.Form.NFC);
    }

    public record UserResponse(Long id, String username) {
    }

    public record AuthResponse(String token, UserResponse user) {
    }
}
