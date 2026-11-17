package com.gastosapp.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Default directories do not depend on the working directory. */
class BackendLocationTest {

    @TempDir
    Path root;

    @Test
    void classesDirectoryOfADevelopmentBuild() throws IOException {
        Path module = Files.createDirectories(root.resolve("gastosAppBackend"));
        Path classes = Files.createDirectories(module.resolve("target/classes"));

        assertThat(BackendLocation.moduleDirFrom(classes)).isEqualTo(module);
    }

    @Test
    void jarBuiltByMavenAndThePrivateCopyOfStartSh() throws IOException {
        Path module = Files.createDirectories(root.resolve("gastosAppBackend"));
        Path jar = Files.createFile(Files.createDirectories(module.resolve("target")).resolve("gastos-backend.jar"));
        Path runCopy = Files.createFile(Files.createDirectories(module.resolve("target/run"))
                .resolve("gastos-backend.jar"));

        assertThat(BackendLocation.moduleDirFrom(jar)).isEqualTo(module);
        assertThat(BackendLocation.moduleDirFrom(runCopy)).isEqualTo(module);
    }

    @Test
    void jarOutsideATargetFolderUsesItsOwnFolder() throws IOException {
        Path folder = Files.createDirectories(root.resolve("instalacion"));
        Path jar = Files.createFile(folder.resolve("gastos-backend.jar"));

        assertThat(BackendLocation.moduleDirFrom(jar)).isEqualTo(folder);
    }

    @Test
    void theModuleFolderOfTheseTestsIsTheBackendFolder() {
        // Under Maven the tests run from the backend folder; the deduction must agree with it.
        assertThat(BackendLocation.moduleDir().resolve("pom.xml")).exists();
    }

    @Test
    void toolDataDirDefaultsToTheSiblingDataFolderOfTheModule() {
        Path module = root.resolve("gastosAppBackend");

        assertThat(BackendLocation.dataDir(Map.of(), module)).isEqualTo(root.resolve("data"));
        assertThat(BackendLocation.dataDir(Map.of("GASTOS_DATA_DIR", " "), module)).isEqualTo(root.resolve("data"));
    }

    @Test
    void toolDataDirComesFromTheVariableWhenSet() {
        Path module = root.resolve("gastosAppBackend");
        Path custom = root.resolve("otros-datos");

        assertThat(BackendLocation.dataDir(Map.of("GASTOS_DATA_DIR", custom.toString()), module)).isEqualTo(custom);
    }
}
