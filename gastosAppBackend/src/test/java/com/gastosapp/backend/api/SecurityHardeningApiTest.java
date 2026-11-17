package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.gastosapp.backend.config.SecurityConfig;

/**
 * Hardening of the second security review: Host header check (DNS rebinding),
 * security headers, read-only frontend paths, pagination bounds, login input
 * caps and Unicode NFC usernames.
 */
class SecurityHardeningApiTest extends ApiTestSupport {

    private MockHttpServletResponse perform(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request).andReturn().getResponse();
    }

    private static Reply reply(MockHttpServletResponse response) throws Exception {
        return new Reply(response.getStatus(), response.getContentAsString(StandardCharsets.UTF_8));
    }

    // ---------- Host ----------

    @Test
    void mockMvcDefaultHostIsAccepted() throws Exception {
        Session session = register();

        doGet(session, "/api/auth/me").expect(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"localhost", "LOCALHOST", "localhost:80", "127.0.0.1", "127.0.0.1:80", "[::1]",
            "[::1]:80"})
    void localHostsWithTheServerPortOrWithoutPortAreAccepted(String host) throws Exception {
        Session session = register();

        MockHttpServletResponse response = perform(get("/api/auth/me").header(HttpHeaders.HOST, host)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + session.token()));

        assertThat(response.getStatus()).as("Host %s", host).isEqualTo(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"evil.example", "evil.example:80", "localhost:8080", "127.0.0.1:1234",
            "localhost.evil.example", "127.0.0.2", "0.0.0.0", "[::1]:81", "::1", "localhost:", "localhost:abc"})
    void otherHostsAnswer403WithTheErrorBody(String host) throws Exception {
        MockHttpServletResponse response = perform(post("/api/auth/login").header(HttpHeaders.HOST, host)
                .contentType("application/json").content("{\"username\":\"ana\",\"password\":\"secreto-123\"}"));

        assertPlainError(reply(response), 403, "Forbidden");
        assertThat(response.getHeader("Content-Security-Policy")).isEqualTo(SecurityConfig.CONTENT_SECURITY_POLICY);
    }

    @Test
    void theHostCheckAlsoAppliesOutsideTheApi() throws Exception {
        MockHttpServletResponse response = perform(get("/cuenta").header(HttpHeaders.HOST, "evil.example"));

        assertPlainError(reply(response), 403, "Forbidden");
    }

    @Test
    void aRejectedHostDoesNotCountAsALoginAttempt() throws Exception {
        Session session = register();
        for (int i = 0; i < 6; i++) {
            perform(post("/api/auth/login").header(HttpHeaders.HOST, "evil.example").contentType("application/json")
                    .content(objectMapper.writeValueAsString(
                            Map.of("username", session.username(), "password", "mala-clave-1"))));
        }

        doPost(null, "/api/auth/login", Map.of("username", session.username(), "password", PASSWORD)).expect(200);
    }

    // ---------- Security headers ----------

    @ParameterizedTest
    @ValueSource(strings = {"/api/auth/me", "/api/expenses", "/api/no-existe", "/cuenta", "/"})
    void everyResponseHasTheSecurityHeaders(String url) throws Exception {
        MockHttpServletResponse response = perform(get(url));

        assertThat(response.getHeader("Content-Security-Policy")).isEqualTo(SecurityConfig.CONTENT_SECURITY_POLICY);
        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY");
    }

    @Test
    void authenticatedResponsesHaveTheSecurityHeadersToo() throws Exception {
        Session session = register();

        MockHttpServletResponse response = perform(get("/api/categories")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + session.token()));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getHeader("Content-Security-Policy")).isEqualTo(SecurityConfig.CONTENT_SECURITY_POLICY);
        assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY");
    }

    @Test
    void theContentSecurityPolicyIsTheAgreedOne() {
        assertThat(SecurityConfig.CONTENT_SECURITY_POLICY).isEqualTo("default-src 'self'; script-src 'self'; "
                + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; "
                + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    }

    // ---------- Methods outside /api ----------

    @ParameterizedTest
    @CsvSource({"POST, /", "POST, /cuenta", "PUT, /assets/index.js", "DELETE, /gastos", "PATCH, /limites",
            "OPTIONS, /", "POST, /apis", "POST, /favicon.svg"})
    void onlyGetAndHeadArePublicOutsideTheApi(String method, String url) throws Exception {
        MockHttpServletResponse response = perform(request(HttpMethod.valueOf(method), url));

        assertPlainError(reply(response), 405, "Method Not Allowed");
        assertThat(response.getHeader(HttpHeaders.ALLOW)).isEqualTo("GET, HEAD");
        assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY");
    }

    @Test
    void headOutsideTheApiIsNotRejected() throws Exception {
        // No frontend in this context: 404, but never 401, 403 or 405.
        assertThat(perform(request(HttpMethod.HEAD, "/cuenta")).getStatus()).isEqualTo(404);
    }

    @Test
    void otherMethodsInsideTheApiAreNotAffected() throws Exception {
        assertPlainError(reply(perform(request(HttpMethod.PATCH, "/api/expenses/1"))), 401, "Unauthorized");
        // Encoded characters in the path are rejected by Spring Security's firewall before any filter: never a 405.
        assertThat(perform(request(HttpMethod.POST, "/%61pi/expenses")).getStatus()).isEqualTo(400);
    }

    // ---------- Pagination ----------

    @ParameterizedTest
    @ValueSource(strings = {"page=-1", "page=-2147483648", "page=100001", "page=2147483647", "page=99999999999",
            "page=99999999999999999999999", "page=abc", "page=1.5"})
    void outOfRangePagesAnswer400OnPage(String query) throws Exception {
        Session session = register();

        assertValidationError(doGet(session, "/api/expenses?" + query), "page");
    }

    @ParameterizedTest
    @ValueSource(strings = {"size=0", "size=-5", "size=101", "size=2147483647", "size=99999999999", "size=x"})
    void outOfRangeSizesAnswer400OnSize(String query) throws Exception {
        Session session = register();

        assertValidationError(doGet(session, "/api/expenses?" + query), "size");
    }

    @Test
    void theLastAllowedPageAnswersAnEmptyPage() throws Exception {
        Session session = register();

        Reply reply = doGet(session, "/api/expenses?page=100000&size=100").expect(200);

        assertThat(reply.<Integer>read("$.page")).isEqualTo(100000);
        assertThat(reply.<java.util.List<Object>>read("$.content")).isEmpty();
    }

    @Test
    void pageAndSizeOutOfRangeTogetherReportBothFields() throws Exception {
        Session session = register();

        assertValidationError(doGet(session, "/api/expenses?page=-1&size=1000"), "page", "size");
    }

    // ---------- Login caps ----------

    @Test
    void loginUsernameOver30CharactersAnswers400AndDoesNotCount() throws Exception {
        Session session = register();
        String tooLong = "a".repeat(31);

        for (int i = 0; i < 6; i++) {
            assertValidationError(doPost(null, "/api/auth/login",
                    Map.of("username", tooLong, "password", PASSWORD)), "username");
        }
        doPost(null, "/api/auth/login", Map.of("username", session.username(), "password", PASSWORD)).expect(200);
    }

    @Test
    void loginPasswordOver72BytesAnswers400AndDoesNotCount() throws Exception {
        Session session = register();

        for (int i = 0; i < 6; i++) {
            assertValidationError(doPost(null, "/api/auth/login",
                    Map.of("username", session.username(), "password", "ñ".repeat(37))), "password");
            assertValidationError(doPost(null, "/api/auth/login",
                    Map.of("username", session.username(), "password", "x".repeat(10_000))), "password");
        }
        doPost(null, "/api/auth/login", Map.of("username", session.username(), "password", PASSWORD)).expect(200);
    }

    @Test
    void loginUsernameOfExactly30CharactersIsChecked() throws Exception {
        Reply reply = doPost(null, "/api/auth/login", Map.of("username", "b".repeat(30), "password", PASSWORD));

        assertPlainError(reply, 401, "Unauthorized");
    }

    @Test
    void unknownUsernamesCountForTheLoginLimit() throws Exception {
        String unknown = uniqueUsername();
        for (int i = 0; i < 5; i++) {
            doPost(null, "/api/auth/login", Map.of("username", unknown, "password", PASSWORD)).expect(401);
        }

        assertPlainError(doPost(null, "/api/auth/login", Map.of("username", unknown, "password", PASSWORD)), 429,
                "Too Many Requests");
    }

    // ---------- Unicode NFC ----------

    @Test
    void usernamesAreStoredInNfcAndBothFormsLogIn() throws Exception {
        String suffix = Long.toString(System.nanoTime(), 36);
        String decomposed = "José" + suffix; // "José" with a combining accent (NFD)
        String composed = Normalizer.normalize(decomposed, Normalizer.Form.NFC);

        Reply registered = doPost(null, "/api/auth/register",
                Map.of("username", decomposed, "password", PASSWORD)).expect(201);

        assertThat(registered.<String>read("$.user.username")).isEqualTo(composed);
        assertThat(jdbc.queryForObject("select username from users where id = ?", String.class,
                registered.<Number>read("$.user.id").longValue())).isEqualTo(composed);
        doPost(null, "/api/auth/login", Map.of("username", composed, "password", PASSWORD)).expect(200);
        doPost(null, "/api/auth/login", Map.of("username", decomposed, "password", PASSWORD)).expect(200);
        doPost(null, "/api/auth/register", Map.of("username", composed, "password", PASSWORD)).expect(409);
    }
}
