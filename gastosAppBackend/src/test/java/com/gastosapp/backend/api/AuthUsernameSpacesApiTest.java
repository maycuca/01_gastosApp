package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Spec section 2 (User): "se ignoran los espacios al inicio y al final, tanto al registrarse
 * como al iniciar sesión". Complements {@code AuthApiTest.usernameIgnoresSurroundingSpaces}.
 */
class AuthUsernameSpacesApiTest extends ApiTestSupport {

    @Test
    void usernameIsStoredWithoutSurroundingSpaces() throws Exception {
        String username = uniqueUsername();

        Reply reply = doPost(null, "/api/auth/register",
                Map.of("username", " \t " + username + " \n", "password", PASSWORD)).expect(201);

        Number id = reply.read("$.user.id");
        String stored = jdbc.queryForObject("select username from users where id = ?", String.class, id.longValue());
        assertThat(stored).isEqualTo(username);
        assertThat(reply.<String>read("$.user.username")).isEqualTo(username);
    }

    @Test
    void tokenOfAUsernameRegisteredWithSpacesIdentifiesTheTrimmedUser() throws Exception {
        String username = uniqueUsername();

        Session session = register("  " + username + "  ");

        assertThat(session.username()).isEqualTo(username);
        Reply me = doGet(session, "/api/auth/me").expect(200);
        assertThat(me.<String>read("$.username")).isEqualTo(username);
        // The initial categories belong to that same user.
        List<String> categories = doGet(session, "/api/categories").expect(200).read("$[*].name");
        assertThat(categories).hasSize(7);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", " ", "     ", "\t", " \n " })
    void registerRejectsAUsernameOfOnlySpaces(String username) throws Exception {
        Reply reply = doPost(null, "/api/auth/register", Map.of("username", username, "password", PASSWORD));

        assertValidationError(reply, "username");
    }

    @ParameterizedTest
    @ValueSource(strings = { " ab ", "  a  ", "ab      ", "      ab" })
    void registerMeasuresTheMinimumLengthWithoutTheSpaces(String username) throws Exception {
        Reply reply = doPost(null, "/api/auth/register", Map.of("username", username, "password", PASSWORD));

        assertValidationError(reply, "username");
    }

    @Test
    void registerMeasuresTheMaximumLengthWithoutTheSpaces() throws Exception {
        String suffix = Long.toString(System.nanoTime(), 36);
        String thirty = ("s" + suffix + "abcdefghijklmnopqrstuvwxyz0123").substring(0, 30);
        String thirtyOne = ("t" + suffix + "abcdefghijklmnopqrstuvwxyz01234").substring(0, 31);

        Reply accepted = doPost(null, "/api/auth/register",
                Map.of("username", "   " + thirty + "   ", "password", PASSWORD));
        Reply rejected = doPost(null, "/api/auth/register",
                Map.of("username", " " + thirtyOne + " ", "password", PASSWORD));

        accepted.expect(201);
        assertThat(accepted.<String>read("$.user.username")).isEqualTo(thirty);
        assertValidationError(rejected, "username");
    }

    @Test
    void spacesInsideTheUsernameAreKept() throws Exception {
        String username = "ana maria " + Long.toString(System.nanoTime(), 36);

        Reply registered = doPost(null, "/api/auth/register",
                Map.of("username", " " + username + " ", "password", PASSWORD)).expect(201);
        Reply login = doPost(null, "/api/auth/login", Map.of("username", username, "password", PASSWORD));
        Reply withoutInnerSpaces = doPost(null, "/api/auth/login",
                Map.of("username", username.replace(" ", ""), "password", PASSWORD));

        assertThat(registered.<String>read("$.user.username")).isEqualTo(username);
        login.expect(200);
        assertPlainError(withoutInnerSpaces, 401, "Unauthorized");
    }

    @Test
    void repeatedUsernameIsDetectedIgnoringSpacesAndCaseTogether() throws Exception {
        Session session = register();

        Reply reply = doPost(null, "/api/auth/register",
                Map.of("username", "  " + session.username().toUpperCase(Locale.ROOT) + "\t", "password", PASSWORD));

        assertPlainError(reply, 409, "Conflict");
        Integer users = jdbc.queryForObject("select count(*) from users where username = ? collate nocase",
                Integer.class, session.username());
        assertThat(users).isEqualTo(1);
    }

    @Test
    void loginIgnoresSpacesAndCaseTogether() throws Exception {
        Session session = register();

        Reply reply = doPost(null, "/api/auth/login",
                Map.of("username", "\t " + session.username().toUpperCase(Locale.ROOT) + " \n", "password", PASSWORD));

        reply.expect(200);
        assertThat(reply.<Number>read("$.user.id").longValue()).isEqualTo(session.userId());
        assertThat(reply.<String>read("$.user.username")).isEqualTo(session.username());
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   ", "\t\n" })
    void loginRejectsAUsernameOfOnlySpaces(String username) throws Exception {
        Reply reply = doPost(null, "/api/auth/login", Map.of("username", username, "password", PASSWORD));

        assertValidationError(reply, "username");
    }

    @Test
    void loginWithoutUsernameStillAnswers400() throws Exception {
        Reply reply = doPost(null, "/api/auth/login", "{\"password\":\"" + PASSWORD + "\"}");

        assertValidationError(reply, "username");
    }

    @Test
    void registerWithNullUsernameStillAnswers400() throws Exception {
        Reply reply = doPost(null, "/api/auth/register", "{\"username\":null,\"password\":\"" + PASSWORD + "\"}");

        assertValidationError(reply, "username");
    }

    @Test
    void spacesAroundThePasswordAreNotIgnored() throws Exception {
        Session session = register();
        String spaced = uniqueUsername();
        doPost(null, "/api/auth/register", Map.of("username", spaced, "password", "  clave con espacios  "))
                .expect(201);

        Reply padded = doPost(null, "/api/auth/login",
                Map.of("username", session.username(), "password", " " + PASSWORD + " "));
        Reply exact = doPost(null, "/api/auth/login",
                Map.of("username", spaced, "password", "  clave con espacios  "));
        Reply trimmed = doPost(null, "/api/auth/login",
                Map.of("username", spaced, "password", "clave con espacios"));

        assertPlainError(padded, 401, "Unauthorized");
        exact.expect(200);
        assertPlainError(trimmed, 401, "Unauthorized");
    }
}
