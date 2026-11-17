package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Spec sections 1 (Autenticación, Formato de errores), 3 (Autenticación) and 6 (Autenticación y aislamiento). */
class AuthApiTest extends ApiTestSupport {

    @Test
    void registerReturns201WithTokenAndUser() throws Exception {
        String username = uniqueUsername();

        Reply reply = doPost(null, "/api/auth/register", Map.of("username", username, "password", PASSWORD));

        reply.expect(201);
        Map<String, Object> body = reply.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("token", "user");
        assertThat(reply.<String>read("$.token")).isNotBlank();
        Map<String, Object> user = reply.read("$.user");
        assertThat(user.keySet()).containsExactlyInAnyOrder("id", "username");
        assertThat(user).containsEntry("username", username);
    }

    @Test
    void registerCreatesTheSevenInitialCategoriesOrderedByName() throws Exception {
        Session session = register();

        Reply reply = doGet(session, "/api/categories").expect(200);

        List<String> names = reply.read("$[*].name");
        assertThat(names).containsExactly("Comida", "Entretenimiento", "Otros", "Salud", "Servicios", "Transporte",
                "Vivienda");
        List<String> colors = reply.read("$[*].color");
        assertThat(colors).allSatisfy(color -> assertThat(color).matches("^#[0-9A-Fa-f]{6}$"));
        List<Map<String, Object>> categories = reply.read("$[*]");
        assertThat(categories).allSatisfy(
                category -> assertThat(category.keySet()).containsExactlyInAnyOrder("id", "name", "color"));
    }

    @Test
    void repeatedUsernameAnswers409() throws Exception {
        Session session = register();

        Reply reply = doPost(null, "/api/auth/register",
                Map.of("username", session.username(), "password", PASSWORD));

        assertPlainError(reply, 409, "Conflict");
    }

    @Test
    void repeatedUsernameIsDetectedIgnoringCase() throws Exception {
        Session session = register("Maria" + uniqueUsername());

        Reply upper = doPost(null, "/api/auth/register",
                Map.of("username", session.username().toUpperCase(Locale.ROOT), "password", PASSWORD));
        Reply lower = doPost(null, "/api/auth/register",
                Map.of("username", session.username().toLowerCase(Locale.ROOT), "password", PASSWORD));

        assertPlainError(upper, 409, "Conflict");
        assertPlainError(lower, 409, "Conflict");
    }

    @Test
    void usernameIgnoresSurroundingSpaces() throws Exception {
        String username = uniqueUsername();

        Reply registered = doPost(null, "/api/auth/register",
                Map.of("username", "  " + username + " ", "password", PASSWORD));
        Reply repeated = doPost(null, "/api/auth/register", Map.of("username", username, "password", PASSWORD));
        Reply login = doPost(null, "/api/auth/login", Map.of("username", " " + username + "  ", "password", PASSWORD));

        registered.expect(201);
        assertThat(registered.<String>read("$.user.username")).isEqualTo(username);
        assertPlainError(repeated, 409, "Conflict");
        login.expect(200);
    }

    @ParameterizedTest
    @CsvSource({
            "ab, secreto-123, username",
            "abcdefghijklmnopqrstuvwxyz01234, secreto-123, username",
            "validname, 1234567, password",
    })
    void registerValidatesUsernameAndPasswordLength(String username, String password, String field)
            throws Exception {
        Reply reply = doPost(null, "/api/auth/register", Map.of("username", username, "password", password));

        assertValidationError(reply, field);
    }

    @Test
    void registerRequiresUsernameAndPassword() throws Exception {
        Reply reply = doPost(null, "/api/auth/register", "{}");

        assertValidationError(reply, "username", "password");
    }

    @Test
    void usernameOf3And30CharactersAndPasswordOf8AreAccepted() throws Exception {
        String suffix = Long.toString(System.nanoTime(), 36);
        String thirty = ("u" + suffix + "abcdefghijklmnopqrstuvwxyz0123").substring(0, 30);

        doPost(null, "/api/auth/register", Map.of("username", thirty, "password", "12345678")).expect(201);
    }

    @Test
    void passwordIsStoredAsBcryptHash() throws Exception {
        Session session = register();

        String hash = jdbc.queryForObject("select password_hash from users where id = ?", String.class,
                session.userId());

        assertThat(hash).isNotEqualTo(PASSWORD).matches("^\\$2[aby]\\$\\d{2}\\$.{53}$");
    }

    @Test
    void loginReturns200WithTokenThatWorks() throws Exception {
        Session session = register();

        Reply reply = doPost(null, "/api/auth/login", Map.of("username", session.username(), "password", PASSWORD));

        reply.expect(200);
        assertThat(reply.<String>read("$.user.username")).isEqualTo(session.username());
        assertThat(reply.<Number>read("$.user.id").longValue()).isEqualTo(session.userId());
        // The login token above was issued with the fixed test clock; use a fresh one issued "now".
        Instant testNow = clock.instant();
        clock.setInstant(Instant.now());
        String token = doPost(null, "/api/auth/login", Map.of("username", session.username(), "password", PASSWORD))
                .expect(200).read("$.token");
        clock.setInstant(testNow);
        Reply me = doGet(new Session(session.userId(), session.username(), token), "/api/auth/me").expect(200);
        Map<String, Object> body = me.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("id", "username");
        assertThat(body).containsEntry("username", session.username());
    }

    @Test
    void wrongPasswordAnswers401() throws Exception {
        Session session = register();

        Reply reply = doPost(null, "/api/auth/login",
                Map.of("username", session.username(), "password", "otra-clave-999"));

        assertPlainError(reply, 401, "Unauthorized");
    }

    @Test
    void unknownUserAnswers401() throws Exception {
        Reply reply = doPost(null, "/api/auth/login", Map.of("username", uniqueUsername(), "password", PASSWORD));

        assertPlainError(reply, 401, "Unauthorized");
    }

    @ParameterizedTest
    @CsvSource({
            "GET, /api/auth/me",
            "PUT, /api/auth/password",
            "GET, /api/categories",
            "POST, /api/categories",
            "PUT, /api/categories/1",
            "POST, /api/expenses",
            "GET, /api/expenses",
            "GET, /api/expenses/1",
            "PUT, /api/expenses/1",
            "DELETE, /api/expenses/1",
            "GET, /api/limits",
            "PUT, /api/limits/MONTH",
            "DELETE, /api/limits/MONTH",
            "GET, /api/dashboard/summary?period=MONTH",
    })
    void protectedEndpointsAnswer401WithoutToken(String method, String url) throws Exception {
        var request = switch (method) {
            case "POST" -> MockMvcRequestBuilders.post(url);
            case "PUT" -> MockMvcRequestBuilders.put(url);
            case "DELETE" -> MockMvcRequestBuilders.delete(url);
            default -> MockMvcRequestBuilders.get(url);
        };
        boolean hasBody = method.equals("POST") || method.equals("PUT");

        Reply reply = send(request, null, hasBody ? "{}" : null);

        assertPlainError(reply, 401, "Unauthorized");
    }

    @Test
    void invalidOrTamperedTokenAnswers401() throws Exception {
        Session session = register();
        String tampered = session.token().substring(0, session.token().length() - 3) + "abc";

        assertPlainError(doGet(new Session(1, "x", "no-es-un-jwt"), "/api/auth/me"), 401, "Unauthorized");
        assertPlainError(doGet(new Session(session.userId(), session.username(), tampered), "/api/auth/me"), 401,
                "Unauthorized");
    }

    @Test
    void tokenIsValidFor24Hours() throws Exception {
        Session session = register();
        Instant testNow = clock.instant();

        clock.setInstant(Instant.now().minus(Duration.ofHours(23)));
        String issued23HoursAgo = doPost(null, "/api/auth/login",
                Map.of("username", session.username(), "password", PASSWORD)).expect(200).read("$.token");
        clock.setInstant(Instant.now().minus(Duration.ofHours(25)));
        String issued25HoursAgo = doPost(null, "/api/auth/login",
                Map.of("username", session.username(), "password", PASSWORD)).expect(200).read("$.token");
        clock.setInstant(testNow);

        doGet(new Session(session.userId(), session.username(), issued23HoursAgo), "/api/auth/me").expect(200);
        assertPlainError(doGet(new Session(session.userId(), session.username(), issued25HoursAgo), "/api/auth/me"),
                401, "Unauthorized");
    }

    @Test
    void thereIsNoLogoutEndpoint() throws Exception {
        Session session = register();

        Reply reply = doPost(session, "/api/auth/logout", "{}");

        assertThat(reply.status()).isIn(404, 405);
    }
}
