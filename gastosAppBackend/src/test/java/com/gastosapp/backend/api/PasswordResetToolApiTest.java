package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import com.gastosapp.backend.tools.PasswordResetTool;

/**
 * Spec sections 6 and 8: the reset tool works on the database of a running
 * application, and the user can then log in with the temporary password.
 */
class PasswordResetToolApiTest extends ApiTestSupport {

    /** File of this context's database (the configured URL contains ${random.uuid}, so ask SQLite). */
    private Path database() {
        return Path.of(jdbc.queryForObject("select file from pragma_database_list where name = 'main'",
                String.class));
    }

    @Test
    void theUserCanLogInWithTheTemporaryPasswordWhileTheAppRuns() throws Exception {
        Session session = register();
        doGet(session, "/api/categories").expect(200); // the application holds its connection open

        String temporary = new PasswordResetTool(new BCryptPasswordEncoder(), new SecureRandom())
                .reset(database(), "  " + session.username().toUpperCase() + " ").temporaryPassword();

        doPost(null, "/api/auth/login", Map.of("username", session.username(), "password", temporary)).expect(200);
        assertPlainError(doPost(null, "/api/auth/login",
                Map.of("username", session.username(), "password", PASSWORD)), 401, "Unauthorized");
    }

    @Test
    void theTemporaryPasswordCanBeChangedAfterwards() throws Exception {
        Session session = register();
        String temporary = new PasswordResetTool(new BCryptPasswordEncoder(), new SecureRandom())
                .reset(database(), session.username()).temporaryPassword();
        Session afterReset = loginSession(session.username(), temporary);

        atRealTime(() -> doPut(afterReset, "/api/auth/password",
                Map.of("currentPassword", temporary, "newPassword", "mi-clave-nueva")).expect(200));

        Reply login = doPost(null, "/api/auth/login",
                Map.of("username", session.username(), "password", "mi-clave-nueva"));
        assertThat(login.status()).isEqualTo(200);
    }

    @Test
    void resettingThePasswordInvalidatesTheTokensIssuedBefore() throws Exception {
        Session session = register();
        doGet(session, "/api/auth/me").expect(200);

        new PasswordResetTool(new BCryptPasswordEncoder(), new SecureRandom()).reset(database(), session.username());

        assertPlainError(doGet(session, "/api/auth/me"), 401, "Unauthorized");
    }
}
