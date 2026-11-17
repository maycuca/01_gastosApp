package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;

/** Spec section 1 (Límite de intentos de login), error table (429) and section 6 (Cuenta y seguridad). */
class LoginAttemptLimitApiTest extends ApiTestSupport {

    private static final String WRONG = "clave-equivocada";

    private MockHttpServletResponse login(String username, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("username", username, "password", password))))
                .andReturn().getResponse();
    }

    private static Reply reply(MockHttpServletResponse response) throws Exception {
        return new Reply(response.getStatus(), response.getContentAsString(StandardCharsets.UTF_8));
    }

    private void failTimes(String username, int times) throws Exception {
        for (int i = 0; i < times; i++) {
            assertThat(login(username, WRONG).getStatus()).as("failed attempt %d", i + 1).isEqualTo(401);
        }
    }

    @Test
    void afterFiveFailuresTheNextAttemptAnswers429WithRetryAfter() throws Exception {
        Session session = register();
        failTimes(session.username(), 5);

        MockHttpServletResponse response = login(session.username(), WRONG);

        assertPlainError(reply(response), 429, "Too Many Requests");
        assertThat(response.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("900");
        assertThat(reply(response).<String>read("$.message")).contains("15 minutos");
    }

    @Test
    void whileLockedEvenTheCorrectPasswordAnswers429() throws Exception {
        Session session = register();
        failTimes(session.username(), 5);

        MockHttpServletResponse response = login(session.username(), PASSWORD);

        assertPlainError(reply(response), 429, "Too Many Requests");
        assertThat(response.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("900");
    }

    @Test
    void fourFailuresDoNotLock() throws Exception {
        Session session = register();
        failTimes(session.username(), 4);

        assertThat(login(session.username(), PASSWORD).getStatus()).isEqualTo(200);
    }

    @Test
    void theFifthFailureItselfIsStillA401() throws Exception {
        Session session = register();
        failTimes(session.username(), 4);

        assertThat(login(session.username(), WRONG).getStatus()).isEqualTo(401);
        assertThat(login(session.username(), WRONG).getStatus()).isEqualTo(429);
    }

    @Test
    void retryAfterCountsDownAndTheLockEndsAfter15Minutes() throws Exception {
        Session session = register();
        failTimes(session.username(), 5);

        clock.setInstant(clock.instant().plus(Duration.ofMinutes(10)));
        MockHttpServletResponse afterTen = login(session.username(), PASSWORD);
        clock.setInstant(clock.instant().plus(Duration.ofMinutes(5)).minusSeconds(1));
        MockHttpServletResponse oneSecondLeft = login(session.username(), PASSWORD);
        clock.setInstant(clock.instant().plusSeconds(1));
        MockHttpServletResponse afterFifteen = login(session.username(), PASSWORD);

        assertThat(afterTen.getStatus()).isEqualTo(429);
        assertThat(afterTen.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("300");
        assertThat(oneSecondLeft.getStatus()).isEqualTo(429);
        assertThat(oneSecondLeft.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("1");
        assertThat(afterFifteen.getStatus()).isEqualTo(200);
    }

    @Test
    void afterTheLockTheCounterStartsAgain() throws Exception {
        Session session = register();
        failTimes(session.username(), 5);
        clock.setInstant(clock.instant().plus(Duration.ofMinutes(15)));

        failTimes(session.username(), 4);

        assertThat(login(session.username(), PASSWORD).getStatus()).isEqualTo(200);
    }

    @Test
    void attemptsDuringTheLockDoNotExtendIt() throws Exception {
        Session session = register();
        failTimes(session.username(), 5);
        for (int i = 0; i < 3; i++) {
            clock.setInstant(clock.instant().plus(Duration.ofMinutes(4)));
            assertThat(login(session.username(), WRONG).getStatus()).isEqualTo(429);
        }

        clock.setInstant(clock.instant().plus(Duration.ofMinutes(3)));

        assertThat(login(session.username(), PASSWORD).getStatus()).isEqualTo(200);
    }

    @Test
    void aSuccessfulLoginResetsTheCounter() throws Exception {
        Session session = register();
        failTimes(session.username(), 4);
        assertThat(login(session.username(), PASSWORD).getStatus()).isEqualTo(200);

        failTimes(session.username(), 4);

        assertThat(login(session.username(), PASSWORD).getStatus()).isEqualTo(200);
    }

    @Test
    void theCounterIgnoresCaseAndSurroundingSpaces() throws Exception {
        Session session = register("Lucia" + uniqueUsername());
        String name = session.username();
        login(name, WRONG);
        login(name.toUpperCase(Locale.ROOT), WRONG);
        login(name.toLowerCase(Locale.ROOT), WRONG);
        login("  " + name + " ", WRONG);
        login(" " + name.toUpperCase(Locale.ROOT), WRONG);

        MockHttpServletResponse response = login(name.toLowerCase(Locale.ROOT) + "   ", PASSWORD);

        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("900");
    }

    @Test
    void theLockIsPerUsername() throws Exception {
        Session locked = register();
        Session other = register();
        failTimes(locked.username(), 5);

        assertThat(login(other.username(), PASSWORD).getStatus()).isEqualTo(200);
        assertThat(login(locked.username(), PASSWORD).getStatus()).isEqualTo(429);
    }

    @Test
    void unknownUsernamesAreLimitedToo() throws Exception {
        String unknown = uniqueUsername();
        failTimes(unknown, 5);

        MockHttpServletResponse response = login(unknown, WRONG);

        assertPlainError(reply(response), 429, "Too Many Requests");
    }

    @Test
    void validationErrorsAreNotCountedAsFailures() throws Exception {
        Session session = register();
        for (int i = 0; i < 6; i++) {
            Reply reply = doPost(null, "/api/auth/login", Map.of("username", session.username()));
            assertValidationError(reply, "password");
        }

        assertThat(login(session.username(), PASSWORD).getStatus()).isEqualTo(200);
    }
}
