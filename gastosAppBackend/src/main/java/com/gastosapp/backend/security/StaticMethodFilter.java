package com.gastosapp.backend.security;

import java.io.IOException;
import java.util.Set;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Outside {@code /api} the backend only serves the compiled frontend, which is
 * read-only: GET and HEAD are public, any other method is a 405 with
 * {@code Allow: GET, HEAD} and the spec's error body.
 */
public class StaticMethodFilter extends OncePerRequestFilter {

    private static final Set<String> ALLOWED = Set.of("GET", "HEAD");

    private final ApiErrorWriter errorWriter;

    public StaticMethodFilter(ApiErrorWriter errorWriter) {
        this.errorWriter = errorWriter;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!isApiPath(request) && !ALLOWED.contains(request.getMethod())) {
            response.setHeader(HttpHeaders.ALLOW, "GET, HEAD");
            errorWriter.write(response, HttpStatus.METHOD_NOT_ALLOWED, "Método no permitido");
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean isApiPath(HttpServletRequest request) {
        // Decoded path, as Spring MVC sees it ("/%61pi/..." is "/api/...").
        String path = UrlPathHelper.defaultInstance.getPathWithinApplication(request);
        return path.equals("/api") || path.startsWith("/api/");
    }
}
