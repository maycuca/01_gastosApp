package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

/**
 * Spec sections 1 and 3 (PUT /api/auth/password, claim {@code pwd}) and 6
 * (Cuenta y seguridad): the change answers 200 with a new token and the
 * previous tokens stop working.
 */
class PasswordChangeApiTest extends ApiTestSupport {

    private static final String NEW_PASSWORD = "nueva-clave-456";

    private static final String WRONG = "no-es-la-clave";

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    /** Issues the token of the answer at the real time, so it is not expired for the JWT decoder. */
    private Reply changePassword(Session session, String current, String next) throws Exception {
        return atRealTime(() -> doPut(session, "/api/auth/password",
                Map.of("currentPassword", current, "newPassword", next)));
    }

    private MockHttpServletResponse rawChangePassword(Session session, String current, String next)
            throws Exception {
        return mvc.perform(put("/api/auth/password")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + session.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("currentPassword", current, "newPassword", next))))
                .andReturn().getResponse();
    }

    private static Reply reply(MockHttpServletResponse response) throws Exception {
        return new Reply(response.getStatus(), response.getContentAsString(StandardCharsets.UTF_8));
    }

    private Reply login(String username, String password) throws Exception {
        return doPost(null, "/api/auth/login", Map.of("username", username, "password", password));
    }

    /** Wrong attempts use the test clock, which is the one the attempt limit uses. */
    private void failTimes(Session session, int times) throws Exception {
        for (int i = 0; i < times; i++) {
            assertValidationError(reply(rawChangePassword(session, WRONG, NEW_PASSWORD)), "currentPassword");
        }
    }

    @Test
    void changingThePasswordAnswers200WithTheLoginBodyAndOnlyTheNewOneWorksAfterwards() throws Exception {
        Session session = register();

        Reply reply = changePassword(session, PASSWORD, NEW_PASSWORD);

        reply.expect(200);
        Map<String, Object> body = reply.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("token", "user");
        assertThat(reply.<String>read("$.token")).isNotBlank().isNotEqualTo(session.token());
        assertThat(reply.<Number>read("$.user.id").longValue()).isEqualTo(session.userId());
        assertThat(reply.<String>read("$.user.username")).isEqualTo(session.username());
        assertPlainError(login(session.username(), PASSWORD), 401, "Unauthorized");
        login(session.username(), NEW_PASSWORD).expect(200);
    }

    @Test
    void theOldTokenAnswers401AfterTheChangeAndTheNewOne200() throws Exception {
        Session session = register();
        Session other = loginSession(session.username(), PASSWORD); // another device of the same user

        Session renewed = sessionFrom(changePassword(session, PASSWORD, NEW_PASSWORD).expect(200));

        assertPlainError(doGet(session, "/api/auth/me"), 401, "Unauthorized");
        assertPlainError(doGet(other, "/api/categories"), 401, "Unauthorized");
        assertThat(doGet(renewed, "/api/auth/me").expect(200).<String>read("$.username"))
                .isEqualTo(session.username());
        doGet(renewed, "/api/categories").expect(200);
    }

    @Test
    void aFailedChangeKeepsTheCurrentTokenValid() throws Exception {
        Session session = register();

        assertValidationError(changePassword(session, WRONG, NEW_PASSWORD), "currentPassword");

        doGet(session, "/api/auth/me").expect(200);
    }

    @Test
    void aTokenWithoutPwdClaimAnswers401() throws Exception {
        Session session = register();
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(String.valueOf(session.userId()))
                .claim("username", session.username())
                .issuedAt(now)
                .expiresAt(now.plus(Duration.ofHours(1)))
                .build();
        String token = new NimbusJwtEncoder(new ImmutableSecret<>(
                new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256")))
                .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        Session withoutPwd = new Session(session.userId(), session.username(), token);

        assertPlainError(doGet(withoutPwd, "/api/auth/me"), 401, "Unauthorized");
        doGet(session, "/api/auth/me").expect(200);
    }

    @Test
    void wrongCurrentPasswordAnswers400OnCurrentPassword() throws Exception {
        Session session = register();

        Reply reply = changePassword(session, WRONG, NEW_PASSWORD);

        assertValidationError(reply, "currentPassword");
        login(session.username(), PASSWORD).expect(200);
    }

    @Test
    void wrongCurrentPasswordIsNotA401() throws Exception {
        Session session = register();

        Reply reply = changePassword(session, WRONG, NEW_PASSWORD);

        assertThat(reply.status()).isEqualTo(400);
    }

    @Test
    void afterFiveWrongCurrentPasswordsTheNextChangeAnswers429WithRetryAfter() throws Exception {
        Session session = register();
        failTimes(session, 5);

        MockHttpServletResponse response = rawChangePassword(session, PASSWORD, NEW_PASSWORD);

        assertPlainError(reply(response), 429, "Too Many Requests");
        assertThat(response.getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("900");
        assertThat(reply(response).<String>read("$.message")).contains("15 minutos");
        login(session.username(), PASSWORD).expect(200); // the password did not change
    }

    @Test
    void theFifthWrongCurrentPasswordIsStillA400() throws Exception {
        Session session = register();
        failTimes(session, 4);

        assertValidationError(reply(rawChangePassword(session, WRONG, NEW_PASSWORD)), "currentPassword");
        assertThat(rawChangePassword(session, WRONG, NEW_PASSWORD).getStatus()).isEqualTo(429);
    }

    @Test
    void thePasswordChangeLockEndsAfter15Minutes() throws Exception {
        Session session = register();
        failTimes(session, 5);

        clock.setInstant(clock.instant().plus(Duration.ofMinutes(14)));
        assertThat(rawChangePassword(session, PASSWORD, NEW_PASSWORD).getStatus()).isEqualTo(429);

        clock.setInstant(clock.instant().plus(Duration.ofMinutes(1)));
        assertThat(rawChangePassword(session, PASSWORD, NEW_PASSWORD).getStatus()).isEqualTo(200);
    }

    @Test
    void aSuccessfulChangeResetsTheCounter() throws Exception {
        Session session = register();
        failTimes(session, 4);
        changePassword(session, PASSWORD, NEW_PASSWORD).expect(200);
        Session renewed = loginSession(session.username(), NEW_PASSWORD);

        failTimes(renewed, 4);
        assertValidationError(reply(rawChangePassword(renewed, WRONG, PASSWORD)), "currentPassword");
    }

    @Test
    void thePasswordChangeLockIsPerUserAndDoesNotAffectLogin() throws Exception {
        Session locked = register();
        Session other = register();
        failTimes(locked, 5);

        changePassword(other, PASSWORD, NEW_PASSWORD).expect(200);
        login(locked.username(), PASSWORD).expect(200);
    }

    @ParameterizedTest
    @ValueSource(strings = {"1234567", "corta"})
    void tooShortNewPasswordAnswers400OnNewPassword(String newPassword) throws Exception {
        Session session = register();

        Reply reply = changePassword(session, PASSWORD, newPassword);

        assertValidationError(reply, "newPassword");
        login(session.username(), PASSWORD).expect(200);
    }

    @Test
    void newPasswordOfExactly8CharactersIsAccepted() throws Exception {
        Session session = register();

        changePassword(session, PASSWORD, "12345678").expect(200);

        login(session.username(), "12345678").expect(200);
    }

    @Test
    void newPasswordOver72BytesAnswers400OnNewPassword() throws Exception {
        Session session = register();
        String tooLong = "ñ".repeat(37); // 74 bytes in UTF-8

        Reply reply = changePassword(session, PASSWORD, tooLong);

        assertValidationError(reply, "newPassword");
        login(session.username(), PASSWORD).expect(200);
    }

    @Test
    void newPasswordOfExactly72BytesIsAccepted() throws Exception {
        Session session = register();
        String limit = "ñ".repeat(36); // 72 bytes

        changePassword(session, PASSWORD, limit).expect(200);

        login(session.username(), limit).expect(200);
    }

    @Test
    void missingFieldsAnswer400OnBothFields() throws Exception {
        Session session = register();

        Reply reply = doPut(session, "/api/auth/password", "{}");

        assertValidationError(reply, "currentPassword", "newPassword");
    }

    @Test
    void withoutTokenAnswers401() throws Exception {
        Reply reply = doPut(null, "/api/auth/password",
                Map.of("currentPassword", PASSWORD, "newPassword", NEW_PASSWORD));

        assertPlainError(reply, 401, "Unauthorized");
    }

    @Test
    void onlyTheTokenOwnersPasswordChanges() throws Exception {
        Session owner = register();
        Session other = register();

        changePassword(owner, PASSWORD, NEW_PASSWORD).expect(200);

        login(other.username(), PASSWORD).expect(200);
        assertPlainError(login(other.username(), NEW_PASSWORD), 401, "Unauthorized");
        doGet(other, "/api/auth/me").expect(200);
    }
}
