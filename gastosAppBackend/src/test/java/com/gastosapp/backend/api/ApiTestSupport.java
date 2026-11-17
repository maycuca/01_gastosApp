package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.jayway.jsonpath.JsonPath;

import tools.jackson.databind.ObjectMapper;

/**
 * Base of the endpoint tests: full application context, real SQLite test
 * database (target/test-db, never ../data/gastos.db), MockMvc with the real
 * security filter chain and a clock fixed by each test.
 */
@SpringBootTest
@Import(TestClockConfig.class)
abstract class ApiTestSupport {

    /** Wednesday. WEEK 11-16..11-22, FORTNIGHT 11-16..11-30. */
    protected static final LocalDate TODAY = LocalDate.of(2026, 11, 18);

    protected static final String PASSWORD = "secreto-123";

    private static final AtomicInteger USER_SEQUENCE = new AtomicInteger();

    @Autowired
    protected WebApplicationContext context;

    @Autowired
    protected MutableClock clock;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected JdbcTemplate jdbc;

    protected MockMvc mvc;

    /** Authenticated user of a test. */
    protected record Session(long userId, String username, String token) {
    }

    /** Status and body of a response. */
    protected record Reply(int status, String body) {

        <T> T read(String path) {
            return JsonPath.read(body, path);
        }

        /** Numeric value at {@code path} as an exact decimal. */
        BigDecimal decimal(String path) {
            Object value = JsonPath.read(body, path);
            return new BigDecimal(String.valueOf(value));
        }

        Reply expect(int expectedStatus) {
            assertThat(status).as("HTTP status (body: %s)", body).isEqualTo(expectedStatus);
            return this;
        }
    }

    @BeforeEach
    void setUpMockMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        clock.setDate(TODAY);
    }

    // ---------- HTTP ----------

    protected Reply send(MockHttpServletRequestBuilder request, Session session, Object body) throws Exception {
        if (session != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + session.token());
        }
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON)
                    .content(body instanceof String text ? text : objectMapper.writeValueAsString(body));
        }
        var response = mvc.perform(request).andReturn().getResponse();
        return new Reply(response.getStatus(), response.getContentAsString(StandardCharsets.UTF_8));
    }

    protected Reply doGet(Session session, String url, Object... uriVariables) throws Exception {
        return send(get(url, uriVariables), session, null);
    }

    protected Reply doPost(Session session, String url, Object body) throws Exception {
        return send(post(url), session, body);
    }

    protected Reply doPut(Session session, String url, Object body) throws Exception {
        return send(put(url), session, body);
    }

    protected Reply doDelete(Session session, String url) throws Exception {
        return send(delete(url), session, null);
    }

    // ---------- Users ----------

    protected static String uniqueUsername() {
        return "user" + USER_SEQUENCE.incrementAndGet() + "x" + Long.toString(System.nanoTime(), 36);
    }

    /**
     * Registers a new user. The token is issued at the real current time (the JWT
     * decoder checks expiry against the real clock), then the test clock is restored.
     */
    protected Session register() throws Exception {
        return register(uniqueUsername());
    }

    protected Session register(String username) throws Exception {
        Instant testNow = clock.instant();
        clock.setInstant(Instant.now());
        try {
            Reply reply = doPost(null, "/api/auth/register", Map.of("username", username, "password", PASSWORD))
                    .expect(201);
            Number id = reply.read("$.user.id");
            return new Session(id.longValue(), reply.read("$.user.username"), reply.read("$.token"));
        } finally {
            clock.setInstant(testNow);
        }
    }

    /** Logs in at the real current time (see {@link #register(String)}). */
    protected Session loginSession(String username, String password) throws Exception {
        Reply reply = atRealTime(() -> doPost(null, "/api/auth/login",
                Map.of("username", username, "password", password)).expect(200));
        return sessionFrom(reply);
    }

    protected static Session sessionFrom(Reply authReply) {
        Number id = authReply.read("$.user.id");
        return new Session(id.longValue(), authReply.read("$.user.username"), authReply.read("$.token"));
    }

    /** Request that issues a token: run at the real time so the token is not expired for the JWT decoder. */
    protected <T> T atRealTime(Callable<T> action) throws Exception {
        Instant testNow = clock.instant();
        clock.setInstant(Instant.now());
        try {
            return action.call();
        } finally {
            clock.setInstant(testNow);
        }
    }

    // ---------- Domain helpers ----------

    protected long categoryId(Session session, String name) throws Exception {
        Reply reply = doGet(session, "/api/categories").expect(200);
        List<Number> ids = reply.read("$[?(@.name == '" + name + "')].id");
        assertThat(ids).as("category %s", name).hasSize(1);
        return ids.get(0).longValue();
    }

    protected static Map<String, Object> expenseBody(String amount, String description, Object date, Long categoryId,
            List<String> tags) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("amount", new BigDecimal(amount));
        body.put("description", description);
        if (date != null) {
            body.put("date", date.toString());
        }
        body.put("categoryId", categoryId);
        if (tags != null) {
            body.put("tags", tags);
        }
        return body;
    }

    protected Reply createExpense(Session session, String amount, String description, LocalDate date, long categoryId,
            String... tags) throws Exception {
        return doPost(session, "/api/expenses", expenseBody(amount, description, date, categoryId, List.of(tags)))
                .expect(201);
    }

    protected long createExpenseId(Session session, String amount, String description, LocalDate date,
            long categoryId, String... tags) throws Exception {
        Number id = createExpense(session, amount, description, date, categoryId, tags).read("$.expense.id");
        return id.longValue();
    }

    protected Reply putLimit(Session session, String period, String amount) throws Exception {
        return doPut(session, "/api/limits/" + period, Map.of("limitAmount", new BigDecimal(amount)));
    }

    protected Reply summary(Session session, String period) throws Exception {
        return doGet(session, "/api/dashboard/summary?period=" + period).expect(200);
    }

    protected static BigDecimal money(String value) {
        return new BigDecimal(value);
    }

    /** Asserts the error body of spec section 1 ("Formato de errores") without {@code fieldErrors}. */
    protected static void assertPlainError(Reply reply, int status, String error) {
        reply.expect(status);
        Map<String, Object> body = reply.read("$");
        assertThat(body).containsEntry("status", status).containsEntry("error", error);
        assertThat(body.get("message")).isInstanceOf(String.class).asString().isNotBlank();
        assertThat(body).as("fieldErrors solo aparece en errores de validación").doesNotContainKey("fieldErrors");
        assertThat(body.keySet()).containsExactlyInAnyOrder("status", "error", "message");
    }

    /** Asserts a 400 validation error whose {@code fieldErrors} name exactly the given fields. */
    protected static void assertValidationError(Reply reply, String... fields) {
        reply.expect(400);
        assertThat(reply.<Integer>read("$.status")).isEqualTo(400);
        assertThat(reply.<String>read("$.error")).isEqualTo("Bad Request");
        assertThat(reply.<String>read("$.message")).isEqualTo("Datos inválidos");
        List<String> errorFields = reply.read("$.fieldErrors[*].field");
        assertThat(errorFields).as("fieldErrors in %s", reply.body()).containsOnly(fields);
        List<String> messages = reply.read("$.fieldErrors[*].message");
        assertThat(messages).allSatisfy(message -> assertThat(message).isNotBlank());
    }
}
