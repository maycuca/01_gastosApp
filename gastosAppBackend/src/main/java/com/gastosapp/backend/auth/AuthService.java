package com.gastosapp.backend.auth;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gastosapp.backend.auth.AuthDtos.AuthResponse;
import com.gastosapp.backend.auth.AuthDtos.ChangePasswordRequest;
import com.gastosapp.backend.auth.AuthDtos.LoginRequest;
import com.gastosapp.backend.auth.AuthDtos.RegisterRequest;
import com.gastosapp.backend.auth.AuthDtos.UserResponse;
import com.gastosapp.backend.category.CategoryService;
import com.gastosapp.backend.common.ApiException;
import com.gastosapp.backend.common.FieldValidationException;
import com.gastosapp.backend.common.TooManyRequestsException;
import com.gastosapp.backend.security.JwtService;

@Service
public class AuthService {

    /** BCrypt only uses the first 72 bytes of a password. */
    private static final int BCRYPT_MAX_BYTES = AuthDtos.PASSWORD_MAX_BYTES;

    private final UserRepository userRepository;
    private final CategoryService categoryService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final LoginAttemptLimiter loginAttemptLimiter;
    private final PasswordChangeAttemptLimiter passwordChangeAttemptLimiter;
    private final Clock clock;

    public AuthService(UserRepository userRepository, CategoryService categoryService,
            PasswordEncoder passwordEncoder, JwtService jwtService, LoginAttemptLimiter loginAttemptLimiter,
            PasswordChangeAttemptLimiter passwordChangeAttemptLimiter, Clock clock) {
        this.loginAttemptLimiter = loginAttemptLimiter;
        this.passwordChangeAttemptLimiter = passwordChangeAttemptLimiter;
        this.userRepository = userRepository;
        this.categoryService = categoryService;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.clock = clock;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        requireBcryptLength("password", request.password());
        if (userRepository.findByUsernameIgnoreCase(request.username()).isPresent()) {
            throw ApiException.conflict("El nombre de usuario ya está en uso");
        }
        User user = userRepository.save(new User(request.username(),
                passwordEncoder.encode(request.password()), LocalDateTime.now(clock)));
        categoryService.createDefaults(user.getId());
        return toAuthResponse(user);
    }

    /**
     * Checks the credentials, subject to the login attempt limit: while a username
     * is locked the password is not even checked (no BCrypt) and the answer is a
     * 429. Failures for usernames that do not exist count as well. A password
     * over 72 bytes is a 400 on {@code password} and does not count.
     */
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        requireBcryptLength("password", request.password());
        loginAttemptLimiter.remainingLock(request.username()).ifPresent(remaining -> {
            throw tooManyAttempts(remaining);
        });
        Optional<User> authenticated = userRepository.findByUsernameIgnoreCase(request.username())
                .filter(user -> passwordMatches(request.password(), user));
        if (authenticated.isEmpty()) {
            loginAttemptLimiter.recordFailure(request.username());
            throw ApiException.unauthorized("Credenciales incorrectas");
        }
        loginAttemptLimiter.recordSuccess(request.username());
        return toAuthResponse(authenticated.get());
    }

    /**
     * Spec section 3: wrong current password and invalid new password are 400 on
     * their own field. After 5 consecutive wrong current passwords the answer is
     * a 429 for 15 minutes, before running BCrypt. On success the answer has a
     * new token; the tokens issued before stop working (their {@code pwd} claim
     * no longer matches the new hash).
     */
    @Transactional
    public AuthResponse changePassword(Long userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Token ausente, inválido o vencido"));
        passwordChangeAttemptLimiter.remainingLock(userId).ifPresent(remaining -> {
            throw tooManyAttempts(remaining);
        });
        if (!passwordMatches(request.currentPassword(), user)) {
            passwordChangeAttemptLimiter.recordFailure(userId);
            throw new FieldValidationException("currentPassword", "La contraseña actual no es correcta");
        }
        requireBcryptLength("newPassword", request.newPassword());
        user.changePasswordHash(passwordEncoder.encode(request.newPassword()));
        passwordChangeAttemptLimiter.recordSuccess(userId);
        return toAuthResponse(user);
    }

    private boolean passwordMatches(String rawPassword, User user) {
        return byteLength(rawPassword) <= BCRYPT_MAX_BYTES
                && passwordEncoder.matches(rawPassword, user.getPasswordHash());
    }

    private static void requireBcryptLength(String field, String password) {
        if (byteLength(password) > BCRYPT_MAX_BYTES) {
            throw new FieldValidationException(field, AuthDtos.PASSWORD_TOO_LONG);
        }
    }

    private static TooManyRequestsException tooManyAttempts(Duration remaining) {
        long seconds = Math.max(1, (remaining.toMillis() + 999) / 1000);
        long minutes = (seconds + 59) / 60;
        String wait = minutes == 1 ? "1 minuto" : minutes + " minutos";
        return new TooManyRequestsException(
                "Demasiados intentos fallidos. Espera " + wait + " antes de volver a intentarlo.", seconds);
    }

    private AuthResponse toAuthResponse(User user) {
        return new AuthResponse(jwtService.issue(user.getId(), user.getUsername(), user.getPasswordHash()),
                new UserResponse(user.getId(), user.getUsername()));
    }

    private static int byteLength(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }
}
