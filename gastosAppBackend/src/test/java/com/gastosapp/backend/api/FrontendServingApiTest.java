package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Spec section 8 (Modo de uso normal) and section 6 (Ejecución y datos): the backend serves the compiled frontend. */
class FrontendServingApiTest extends ApiTestSupport {

    private static final String INDEX = "<!doctype html><html><body><div id=\"root\">Mis Gastos prueba</div></body></html>";
    private static final String SCRIPT = "console.log('mis gastos');";

    private static final Path FRONTEND_DIR = createFrontend();

    private static Path createFrontend() {
        try {
            Path dir = Path.of("target", "test-db", "frontend-" + UUID.randomUUID());
            Files.createDirectories(dir.resolve("assets"));
            Files.writeString(dir.resolve("index.html"), INDEX);
            Files.writeString(dir.resolve("favicon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
            Files.writeString(dir.resolve("assets").resolve("index-AbC123.js"), SCRIPT);
            return dir;
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    @DynamicPropertySource
    static void frontendDir(DynamicPropertyRegistry registry) {
        registry.add("app.dirs.frontend", FRONTEND_DIR::toString);
    }

    private MockHttpServletResponse fetch(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request).andReturn().getResponse();
    }

    @Test
    void rootServesIndexHtmlWithoutTokenAndWithoutCache() throws Exception {
        MockHttpServletResponse response = fetch(get("/"));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentType()).startsWith("text/html");
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(INDEX);
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-cache");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/gastos", "/categorias", "/limites", "/cuenta", "/gastos/12/editar", "/login",
            "/apiary", "/assets/no-existe.js"})
    void interfaceRoutesAndMissingFilesServeIndexHtml(String path) throws Exception {
        MockHttpServletResponse response = fetch(get(path));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(INDEX);
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-cache");
    }

    @Test
    void interfaceRoutesLoadEvenWithAnExpiredOrInvalidToken() throws Exception {
        MockHttpServletResponse response = fetch(get("/gastos").header(HttpHeaders.AUTHORIZATION, "Bearer basura"));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(INDEX);
    }

    @Test
    void hashedAssetsAreServedWithLongCache() throws Exception {
        MockHttpServletResponse response = fetch(get("/assets/index-AbC123.js"));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).isEqualTo(SCRIPT);
        assertThat(response.getContentType()).contains("javascript");
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL))
                .contains("max-age=31536000").contains("public").contains("immutable");
    }

    @Test
    void otherExistingFilesAreServedAsIs() throws Exception {
        MockHttpServletResponse response = fetch(get("/favicon.svg"));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).startsWith("<svg");
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-cache");
    }

    @Test
    void unknownApiRouteAnswersJson404NotThePage() throws Exception {
        Session session = register();

        Reply reply = doGet(session, "/api/no-existe");

        assertPlainError(reply, 404, "Not Found");
        assertThat(reply.body()).doesNotContain("Mis Gastos prueba");
    }

    @Test
    void unknownNestedApiRouteAnswersJson404() throws Exception {
        Session session = register();

        assertPlainError(doGet(session, "/api/expenses/1/no-existe"), 404, "Not Found");
        assertPlainError(doGet(session, "/api"), 404, "Not Found");
    }

    @Test
    void apiStillRequiresTokenEvenWhenTheRouteDoesNotExist() throws Exception {
        assertPlainError(doGet(null, "/api/no-existe"), 401, "Unauthorized");
        assertPlainError(doGet(null, "/api/categories"), 401, "Unauthorized");
    }

    @Test
    void apiResponsesAreNotGivenTheFrontendCacheHeaders() throws Exception {
        Session session = register();

        MockHttpServletResponse response = fetch(get("/api/categories")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + session.token()));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isNotEqualTo("no-cache")
                .doesNotContain("immutable");
    }

    @Test
    void registerAndLoginStillWorkWithoutToken() throws Exception {
        Session session = register();

        doPost(null, "/api/auth/login", java.util.Map.of("username", session.username(), "password", PASSWORD))
                .expect(200);
    }

    @Test
    void writingToAnInterfaceRouteIsNotServedThePage() throws Exception {
        MockHttpServletResponse response = fetch(post("/gastos"));

        assertThat(response.getStatus()).isEqualTo(405);
        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).doesNotContain("Mis Gastos prueba");
    }

    @Test
    void filesOutsideTheFrontendDirectoryAreNotReachable() throws Exception {
        Files.writeString(FRONTEND_DIR.getParent().resolve("secreto.txt"), "no debe verse");

        MockHttpServletResponse response = fetch(get("/../secreto.txt"));

        assertThat(response.getContentAsString(StandardCharsets.UTF_8)).doesNotContain("no debe verse");
    }
}
