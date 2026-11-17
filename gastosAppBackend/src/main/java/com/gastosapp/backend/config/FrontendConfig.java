package com.gastosapp.backend.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Serves the compiled frontend from {@code GASTOS_FRONTEND_DIR} (spec section 8).
 * Every path that does not start with {@code /api} and is not an existing file
 * answers {@code index.html}, so the interface routes survive a reload. Unknown
 * {@code /api/...} paths are left alone and end in the JSON 404 of
 * {@code GlobalExceptionHandler}. When the directory does not exist only the API
 * is served; the directory is checked per request, so building the frontend
 * while the backend runs is enough.
 */
@Configuration
public class FrontendConfig implements WebMvcConfigurer {

    static final String INDEX = "index.html";

    /** Vite puts content-hashed bundles under /assets/, so they can be cached for good. */
    static final String ASSETS_PREFIX = "/assets/";

    private static final Logger log = LoggerFactory.getLogger(FrontendConfig.class);

    private static final String LONG_CACHE = CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable()
            .getHeaderValue();

    private static final String NO_CACHE = CacheControl.noCache().getHeaderValue();

    private final Path frontendDir;

    public FrontendConfig(DirectoryProperties directories) {
        this.frontendDir = directories.frontendDir();
        if (Files.isDirectory(frontendDir)) {
            log.info("Serving the frontend from {}", frontendDir);
        } else {
            log.info("Frontend directory {} not found; serving the API only", frontendDir);
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = frontendDir.toUri().toString();
        registry.addResourceHandler("/**")
                .addResourceLocations(location.endsWith("/") ? location : location + "/")
                .resourceChain(false)
                .addResolver(new SpaResourceResolver());
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new CacheHeadersInterceptor()).excludePathPatterns("/api", "/api/**");
    }

    static boolean isApiPath(String path) {
        String normalized = path.startsWith("/") ? path.substring(1) : path;
        return normalized.equals("api") || normalized.startsWith("api/");
    }

    /** Existing file, or index.html for any other non-API path. */
    private static final class SpaResourceResolver extends PathResourceResolver {

        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            Resource resource = super.getResource(resourcePath, location);
            if (resource != null || isApiPath(resourcePath)) {
                return resource;
            }
            return super.getResource(INDEX, location);
        }
    }

    /** index.html (and the fallback for interface routes) is never cached; hashed assets are cached long. */
    private final class CacheHeadersInterceptor implements HandlerInterceptor {

        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
            String path = request.getRequestURI().substring(request.getContextPath().length());
            response.setHeader(HttpHeaders.CACHE_CONTROL, isExistingAsset(path) ? LONG_CACHE : NO_CACHE);
            return true;
        }

        private boolean isExistingAsset(String path) {
            if (!path.startsWith(ASSETS_PREFIX)) {
                return false;
            }
            Path file = frontendDir.resolve(path.substring(1)).normalize();
            return file.startsWith(frontendDir.resolve("assets")) && Files.isRegularFile(file);
        }
    }
}
