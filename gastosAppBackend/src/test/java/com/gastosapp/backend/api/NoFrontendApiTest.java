package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;

/** Spec section 8: without GASTOS_FRONTEND_DIR the backend starts anyway and only serves the API. */
class NoFrontendApiTest extends ApiTestSupport {

    @Value("${app.dirs.frontend}")
    private String frontendDir;

    @Test
    void theTestProfileHasNoFrontendDirectory() {
        assertThat(Files.exists(Path.of(frontendDir))).isFalse();
    }

    @Test
    void theApiWorksAndInterfaceRoutesAnswerJson404() throws Exception {
        Session session = register();

        doGet(session, "/api/categories").expect(200);
        assertPlainError(doGet(null, "/"), 404, "Not Found");
        assertPlainError(doGet(null, "/gastos"), 404, "Not Found");
        assertPlainError(doGet(session, "/api/no-existe"), 404, "Not Found");
    }
}
