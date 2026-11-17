package com.gastosapp.backend.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** Spec section 8 (Restablecer una contraseña olvidada), on a temporary database built from schema.sql. */
class PasswordResetToolTest {

    private static final String OLD_PASSWORD = "clave-vieja-123";

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final PasswordResetTool tool = new PasswordResetTool(encoder, new SecureRandom());

    @TempDir
    Path dataDir;

    private Path database;

    @BeforeEach
    void setUp() throws Exception {
        database = dataDir.resolve("gastos.db");
        String schema = new String(getClass().getResourceAsStream("/schema.sql").readAllBytes(),
                StandardCharsets.UTF_8);
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database);
                Statement statement = connection.createStatement()) {
            for (String sql : schema.split(";")) {
                if (!sql.isBlank()) {
                    statement.execute(sql);
                }
            }
            try (PreparedStatement insert = connection.prepareStatement(
                    "insert into users (username, password_hash, created_at) values (?, ?, '2026-11-01T10:00:00')")) {
                for (String username : new String[] {"Ana", "Íñigo", "beto"}) {
                    insert.setString(1, username);
                    insert.setString(2, encoder.encode(OLD_PASSWORD));
                    insert.executeUpdate();
                }
            }
        }
    }

    private String hashOf(String username) throws Exception {
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database);
                PreparedStatement select = connection.prepareStatement(
                        "select password_hash from users where username = ?")) {
            select.setString(1, username);
            try (ResultSet rows = select.executeQuery()) {
                return rows.next() ? rows.getString(1) : null;
            }
        }
    }

    @Test
    void setsARandomTemporaryPasswordThatReplacesTheOldOne() throws Exception {
        PasswordResetTool.Result result = tool.reset(database, "Ana");

        String hash = hashOf("Ana");
        assertThat(result.username()).isEqualTo("Ana");
        assertThat(encoder.matches(result.temporaryPassword(), hash)).isTrue();
        assertThat(encoder.matches(OLD_PASSWORD, hash)).isFalse();
        assertThat(encoder.matches(OLD_PASSWORD, hashOf("beto"))).as("other users untouched").isTrue();
    }

    @Test
    void theTemporaryPasswordFollowsTheRegistrationRules() throws Exception {
        String password = tool.reset(database, "Ana").temporaryPassword();

        assertThat(password.length()).isGreaterThanOrEqualTo(8);
        assertThat(password.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(72);
        assertThat(password).matches("[A-Za-z0-9]+").isEqualTo(password.strip());
    }

    @Test
    void temporaryPasswordsAreRandom() {
        Set<String> passwords = new HashSet<>();
        for (int i = 0; i < 200; i++) {
            passwords.add(tool.temporaryPassword());
        }

        assertThat(passwords).hasSize(200);
    }

    @Test
    void theUsernameIgnoresCaseAndSurroundingSpacesLikeLogin() throws Exception {
        assertThat(tool.reset(database, "  ANA ").username()).isEqualTo("Ana");
        assertThat(tool.reset(database, "íÑIGO").username()).isEqualTo("Íñigo");
    }

    @Test
    void anUnknownUserFailsWithoutChanges() throws Exception {
        String before = hashOf("Ana");
        byte[] fileBefore = Files.readAllBytes(database);

        assertThatThrownBy(() -> tool.reset(database, "nadie"))
                .isInstanceOf(PasswordResetTool.UnknownUserException.class).hasMessageContaining("nadie");

        assertThat(hashOf("Ana")).isEqualTo(before);
        assertThat(Files.readAllBytes(database)).isEqualTo(fileBefore);
    }

    @Test
    void aMissingDatabaseIsAnErrorAndIsNotCreated() {
        Path missing = dataDir.resolve("otro").resolve("gastos.db");

        assertThatThrownBy(() -> tool.reset(missing, "Ana")).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("GASTOS_DATA_DIR");
        assertThat(missing).doesNotExist();
    }

    // ---------- Command line ----------

    private record Run(int exitCode, String out, String err) {
    }

    private Run run(String... args) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ByteArrayOutputStream err = new ByteArrayOutputStream();
        int code = PasswordResetTool.run(args, Map.of("GASTOS_DATA_DIR", dataDir.toString()),
                new PrintStream(out, true, StandardCharsets.UTF_8), new PrintStream(err, true, StandardCharsets.UTF_8));
        return new Run(code, out.toString(StandardCharsets.UTF_8), err.toString(StandardCharsets.UTF_8));
    }

    @Test
    void commandLinePrintsTheTemporaryPassword() throws Exception {
        Run run = run("reset-password", "beto");

        assertThat(run.exitCode()).isEqualTo(PasswordResetTool.EXIT_OK);
        Matcher matcher = Pattern.compile("Contraseña temporal: (\\S+)").matcher(run.out());
        assertThat(matcher.find()).as(run.out()).isTrue();
        assertThat(new BCryptPasswordEncoder().matches(matcher.group(1), hashOf("beto"))).isTrue();
    }

    @Test
    void commandLineFailsForAnUnknownUser() throws Exception {
        String before = hashOf("beto");

        Run run = run("reset-password", "nadie");

        assertThat(run.exitCode()).isEqualTo(PasswordResetTool.EXIT_UNKNOWN_USER);
        assertThat(run.err()).contains("No existe el usuario").contains("No se hizo ningún cambio");
        assertThat(run.out()).isEmpty();
        assertThat(hashOf("beto")).isEqualTo(before);
    }

    @Test
    void commandLineRequiresExactlyOneUsername() {
        assertThat(run("reset-password").exitCode()).isEqualTo(PasswordResetTool.EXIT_USAGE);
        assertThat(run("reset-password", " ").exitCode()).isEqualTo(PasswordResetTool.EXIT_USAGE);
        assertThat(run("reset-password", "a", "b").err()).contains("Uso:");
    }

    @Test
    void commandLineReportsAMissingDatabase() throws Exception {
        Files.delete(database);

        Run run = run("reset-password", "Ana");

        assertThat(run.exitCode()).isEqualTo(PasswordResetTool.EXIT_FAILURE);
        assertThat(run.err()).contains("No se encontró la base de datos");
        assertThat(database).doesNotExist();
    }
}
