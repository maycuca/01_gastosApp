package com.gastosapp.backend.tools;

import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteOpenMode;

import com.gastosapp.backend.config.BackendLocation;
import com.gastosapp.backend.config.DirectoryProperties;

/**
 * Command line tool of spec section 8 ("Restablecer una contraseña olvidada"):
 * sets a random temporary password for a user and prints it. It talks to the
 * SQLite file directly (no Spring context, no web server), so it can run while
 * the application is running; SQLite's WAL mode and busy timeout handle the
 * concurrent access.
 *
 * <p>Run with {@code java -jar backend.jar reset-password <username>} (see
 * reset-password.sh). The data directory is resolved like in the application:
 * {@code GASTOS_DATA_DIR}, or {@code ../data} relative to the backend module
 * folder (not to the working directory).
 *
 * <p>Changing the password hash also invalidates every token already issued to
 * the user (their {@code pwd} claim no longer matches).
 */
public final class PasswordResetTool {

    public static final String COMMAND = "reset-password";

    public static final int EXIT_OK = 0;
    public static final int EXIT_UNKNOWN_USER = 1;
    public static final int EXIT_USAGE = 2;
    public static final int EXIT_FAILURE = 3;

    /** Without look-alike characters (0/O, 1/l/I) so it can be typed from the screen. */
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

    /** Above the 8-character minimum, ASCII only, far below BCrypt's 72 bytes. */
    static final int TEMPORARY_PASSWORD_LENGTH = 16;

    private static final int BUSY_TIMEOUT_MILLIS = 10_000;

    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random;

    public PasswordResetTool(PasswordEncoder passwordEncoder, SecureRandom random) {
        this.passwordEncoder = passwordEncoder;
        this.random = random;
    }

    /** Thrown when the user does not exist; nothing has been changed. */
    public static final class UnknownUserException extends Exception {
        UnknownUserException(String username) {
            super("No existe el usuario \"" + username + "\"");
        }
    }

    public record Result(String username, String temporaryPassword) {
    }

    public static void main(String[] args) {
        System.exit(run(args, System.getenv(), System.out, System.err));
    }

    /** Entry point without {@code System.exit}; {@code args[0]} is the command name. */
    public static int run(String[] args, Map<String, String> env, PrintStream out, PrintStream err) {
        if (args.length != 2 || args[1].isBlank()) {
            err.println("Uso: ./reset-password.sh <username>");
            return EXIT_USAGE;
        }
        Path database = BackendLocation.dataDir(env, BackendLocation.moduleDir())
                .resolve(DirectoryProperties.DATABASE_FILE);
        try {
            Result result = new PasswordResetTool(new BCryptPasswordEncoder(), new SecureRandom())
                    .reset(database, args[1]);
            out.println("Contraseña restablecida para el usuario \"" + result.username() + "\".");
            out.println("Contraseña temporal: " + result.temporaryPassword());
            out.println("Entra con ella y cámbiala desde la página Cuenta.");
            return EXIT_OK;
        } catch (UnknownUserException ex) {
            err.println("Error: " + ex.getMessage() + ". No se hizo ningún cambio.");
            return EXIT_UNKNOWN_USER;
        } catch (IllegalStateException ex) {
            err.println("Error: " + ex.getMessage());
            return EXIT_FAILURE;
        } catch (SQLException ex) {
            err.println("Error al acceder a la base de datos " + database + ": " + ex.getMessage());
            return EXIT_FAILURE;
        }
    }

    /**
     * Sets a new temporary password for {@code username} (case-insensitive,
     * surrounding spaces ignored, Unicode NFC, as in login) in the database file.
     */
    public Result reset(Path database, String username) throws UnknownUserException, SQLException {
        if (!Files.isRegularFile(database)) {
            throw new IllegalStateException("No se encontró la base de datos " + database
                    + " (revisa GASTOS_DATA_DIR)");
        }
        String key = Normalizer.normalize(username.strip(), Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
        SQLiteConfig config = new SQLiteConfig();
        config.setBusyTimeout(BUSY_TIMEOUT_MILLIS);
        config.enforceForeignKeys(true);
        // Never create the file: a missing database is an error, not a new empty one.
        config.resetOpenMode(SQLiteOpenMode.CREATE);
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + database,
                config.toProperties())) {
            connection.setAutoCommit(false);
            try {
                Optional<Long> userId = Optional.empty();
                String storedUsername = null;
                // Same comparison as the application (Java's lower-casing, not SQLite's ASCII-only lower()).
                try (PreparedStatement select = connection.prepareStatement("select id, username from users");
                        ResultSet rows = select.executeQuery()) {
                    while (rows.next()) {
                        if (rows.getString("username").toLowerCase(Locale.ROOT).equals(key)) {
                            userId = Optional.of(rows.getLong("id"));
                            storedUsername = rows.getString("username");
                            break;
                        }
                    }
                }
                if (userId.isEmpty()) {
                    connection.rollback();
                    throw new UnknownUserException(username.strip());
                }
                String temporaryPassword = temporaryPassword();
                try (PreparedStatement update = connection.prepareStatement(
                        "update users set password_hash = ? where id = ?")) {
                    update.setString(1, passwordEncoder.encode(temporaryPassword));
                    update.setLong(2, userId.get());
                    update.executeUpdate();
                }
                connection.commit();
                return new Result(storedUsername, temporaryPassword);
            } catch (SQLException | RuntimeException ex) {
                connection.rollback();
                throw ex;
            }
        }
    }

    String temporaryPassword() {
        StringBuilder password = new StringBuilder(TEMPORARY_PASSWORD_LENGTH);
        for (int i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++) {
            password.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return password.toString();
    }
}
