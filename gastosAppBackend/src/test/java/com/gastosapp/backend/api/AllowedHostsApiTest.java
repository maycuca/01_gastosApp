package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.TestPropertySource;

/** GASTOS_ALLOWED_HOSTS adds names to the hosts accepted by the Host header check. */
@TestPropertySource(properties = "app.security.allowed-hosts= mi-pc.local , Casa.Lan:9090,")
class AllowedHostsApiTest extends ApiTestSupport {

    @ParameterizedTest
    @CsvSource({
            "mi-pc.local, 200",
            "MI-PC.local:80, 200",
            "mi-pc.local:9090, 403",
            "casa.lan:9090, 200",
            "casa.lan, 403",
            "casa.lan:80, 403",
            "localhost, 200",
            "otro.local, 403",
    })
    void configuredHostsAreAddedToTheLocalOnes(String host, int expected) throws Exception {
        Session session = register();

        int status = mvc.perform(get("/api/auth/me").header(HttpHeaders.HOST, host)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + session.token())).andReturn().getResponse().getStatus();

        assertThat(status).as("Host %s", host).isEqualTo(expected);
    }
}
