package com.gastosapp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Map;
import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.core.env.StandardEnvironment;

/**
 * Production configuration (src/main/resources/application.properties) of spec
 * sections 1 and 8: no default JWT secret, configurable data and frontend
 * directories, database inside the data directory.
 */
class ApplicationPropertiesTest {

    private static Properties mainProperties() throws IOException {
        Properties properties = new Properties();
        // The test classpath also has config/application.properties; this is the main one.
        try (InputStream in = ApplicationPropertiesTest.class.getResourceAsStream("/application.properties")) {
            properties.load(new java.io.InputStreamReader(in, StandardCharsets.UTF_8));
        }
        return properties;
    }

    private static StandardEnvironment environment(Map<String, Object> variables) throws IOException {
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().addFirst(new MapPropertySource("env", variables));
        environment.getPropertySources().addLast(new PropertiesPropertySource("main", mainProperties()));
        return environment;
    }

    @Test
    void thereIsNoDefaultJwtSecret() throws IOException {
        StandardEnvironment environment = environment(Map.of());

        assertThat(mainProperties().getProperty("app.jwt.secret")).isEqualTo("${JWT_SECRET:}");
        assertThat(environment.getProperty("app.jwt.secret")).isEmpty();
    }

    @Test
    void jwtSecretComesFromTheEnvironment() throws IOException {
        StandardEnvironment environment = environment(Map.of("JWT_SECRET", "s".repeat(40)));

        assertThat(environment.getProperty("app.jwt.secret")).isEqualTo("s".repeat(40));
    }

    @Test
    void defaultDirectoriesAreTheSiblingFoldersOfTheBackendModule() throws IOException {
        StandardEnvironment environment = environment(Map.of(BackendLocation.PROPERTY, "/opt/mis-gastos/backend"));

        assertThat(environment.getProperty("app.dirs.data")).isEqualTo("/opt/mis-gastos/backend/../data");
        assertThat(environment.getProperty("app.dirs.frontend"))
                .isEqualTo("/opt/mis-gastos/backend/../gastosAppFronend/dist");
        assertThat(environment.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:sqlite:/opt/mis-gastos/backend/../data/gastos.db");
        assertThat(new DirectoryProperties(environment.getProperty("app.dirs.data"),
                environment.getProperty("app.dirs.frontend")).dataDir()).isEqualTo(Path.of("/opt/mis-gastos/data"));
    }

    @Test
    void withoutTheModuleFolderTheDefaultsFallBackToTheWorkingDirectory() throws IOException {
        StandardEnvironment environment = environment(Map.of());

        assertThat(environment.getProperty("app.dirs.data")).isEqualTo("./../data");
        assertThat(environment.getProperty("app.dirs.frontend")).isEqualTo("./../gastosAppFronend/dist");
    }

    @Test
    void theServerOnlyListensOnLoopbackByDefault() throws IOException {
        assertThat(environment(Map.of()).getProperty("server.address")).isEqualTo("127.0.0.1");
        assertThat(environment(Map.of("GASTOS_BIND_ADDRESS", "0.0.0.0")).getProperty("server.address"))
                .isEqualTo("0.0.0.0");
    }

    @Test
    void extraAllowedHostsComeFromTheEnvironment() throws IOException {
        assertThat(environment(Map.of()).getProperty("app.security.allowed-hosts")).isEmpty();
        assertThat(environment(Map.of("GASTOS_ALLOWED_HOSTS", "mi-pc.local,mi-pc.local:9090"))
                .getProperty("app.security.allowed-hosts")).isEqualTo("mi-pc.local,mi-pc.local:9090");
    }

    @Test
    void directoriesComeFromTheEnvironment() throws IOException {
        StandardEnvironment environment = environment(Map.of(
                "GASTOS_DATA_DIR", "/srv/mis-gastos/datos",
                "GASTOS_FRONTEND_DIR", "/srv/mis-gastos/web"));

        assertThat(environment.getProperty("app.dirs.data")).isEqualTo("/srv/mis-gastos/datos");
        assertThat(environment.getProperty("app.dirs.frontend")).isEqualTo("/srv/mis-gastos/web");
        assertThat(environment.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:sqlite:/srv/mis-gastos/datos/gastos.db");
    }

    @Test
    void sqliteKeepsWalFriendlySinglePool() throws IOException {
        assertThat(mainProperties().getProperty("spring.datasource.hikari.maximum-pool-size")).isEqualTo("1");
    }
}
