package com.gastosapp.backend.config;

import java.io.File;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

import org.springframework.boot.system.ApplicationHome;

import com.gastosapp.backend.BackendApplication;

/**
 * Location of the backend module folder, so the default directories of spec
 * section 8 ({@code ../data} and the compiled frontend) do not depend on the
 * working directory. The folder is deduced from where the application classes
 * live: {@code <module>/target/classes} during development, or a jar under
 * {@code <module>/target/} (start.sh runs {@code target/run/gastos-backend.jar}).
 * A jar outside any {@code target} folder uses the folder that contains it.
 * When nothing can be deduced, the working directory is used.
 */
public final class BackendLocation {

    /** Property holding the module folder; referenced by the defaults in application.properties. */
    public static final String PROPERTY = "app.backend-dir";

    public static final String DATA_DIR_VARIABLE = "GASTOS_DATA_DIR";

    /** Default data directory, relative to the backend module folder. */
    public static final String DEFAULT_DATA_DIR = "../data";

    /** Default compiled frontend, relative to the backend module folder. */
    public static final String DEFAULT_FRONTEND_DIR = "../gastosAppFronend/dist";

    private static final String BUILD_DIR = "target";

    private BackendLocation() {
    }

    /** The backend module folder (absolute and normalized). */
    public static Path moduleDir() {
        File source = new ApplicationHome(BackendApplication.class).getSource();
        return Optional.ofNullable(source)
                .map(file -> moduleDirFrom(file.toPath()))
                .orElseGet(() -> Path.of("").toAbsolutePath().normalize());
    }

    /**
     * Module folder for a jar or classes directory: the parent of the nearest
     * enclosing {@code target} folder, else the folder of the jar (or the
     * classes directory itself).
     */
    static Path moduleDirFrom(Path source) {
        Path absolute = source.toAbsolutePath().normalize();
        for (Path current = absolute.getParent(); current != null; current = current.getParent()) {
            Path name = current.getFileName();
            if (name != null && name.toString().equals(BUILD_DIR) && current.getParent() != null) {
                return current.getParent();
            }
        }
        return absolute.toFile().isFile() && absolute.getParent() != null ? absolute.getParent() : absolute;
    }

    /**
     * Data directory used by the command line tools: {@code GASTOS_DATA_DIR}
     * (relative values against the working directory, like the application) or
     * {@code ../data} relative to the module folder.
     */
    public static Path dataDir(Map<String, String> env, Path moduleDir) {
        return Optional.ofNullable(env.get(DATA_DIR_VARIABLE)).filter(dir -> !dir.isBlank())
                .map(dir -> Path.of(dir).toAbsolutePath())
                .orElseGet(() -> moduleDir.resolve(DEFAULT_DATA_DIR))
                .normalize();
    }
}
