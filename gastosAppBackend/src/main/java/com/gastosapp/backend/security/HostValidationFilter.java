package com.gastosapp.backend.security;

import java.io.IOException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Protection against DNS rebinding: a web page from another site that makes
 * its own domain resolve to 127.0.0.1 still sends its own name in the Host
 * header. Every request (API and frontend) whose Host is not {@code localhost},
 * {@code 127.0.0.1} or {@code [::1]} (with the port the server is listening on,
 * or without port) gets a 403 with the spec's error body. {@code GASTOS_ALLOWED_HOSTS}
 * adds more names: {@code name} accepts it with the real port or without port,
 * {@code name:port} only with that port.
 */
public class HostValidationFilter extends OncePerRequestFilter {

    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]");

    /** Host name (lower case) and optional port of an allowed entry or of a request. */
    record HostAndPort(String host, Integer port) {

        static Optional<HostAndPort> parse(String value) {
            if (value == null) {
                return Optional.empty();
            }
            String text = value.strip().toLowerCase(Locale.ROOT);
            if (text.isEmpty()) {
                return Optional.empty();
            }
            String host;
            String portText = null;
            if (text.startsWith("[")) {
                int end = text.indexOf(']');
                if (end < 0) {
                    return Optional.empty();
                }
                host = text.substring(0, end + 1);
                String rest = text.substring(end + 1);
                if (!rest.isEmpty()) {
                    if (!rest.startsWith(":")) {
                        return Optional.empty();
                    }
                    portText = rest.substring(1);
                }
            } else {
                int colon = text.indexOf(':');
                if (colon >= 0) {
                    if (text.indexOf(':', colon + 1) >= 0) {
                        return Optional.empty(); // bare IPv6 without brackets is not a valid Host
                    }
                    host = text.substring(0, colon);
                    portText = text.substring(colon + 1);
                } else {
                    host = text;
                }
            }
            // A trailing dot names the same host ("localhost.").
            if (host.endsWith(".") && host.length() > 1) {
                host = host.substring(0, host.length() - 1);
            }
            if (host.isEmpty()) {
                return Optional.empty();
            }
            if (portText == null) {
                return Optional.of(new HostAndPort(host, null));
            }
            if (portText.isEmpty() || portText.length() > 5 || !portText.chars().allMatch(Character::isDigit)) {
                return Optional.empty();
            }
            return Optional.of(new HostAndPort(host, Integer.valueOf(portText)));
        }
    }

    private final Set<HostAndPort> extraHosts;
    private final ApiErrorWriter errorWriter;

    /** @param extraHosts value of {@code GASTOS_ALLOWED_HOSTS}: comma-separated, may be blank */
    public HostValidationFilter(String extraHosts, ApiErrorWriter errorWriter) {
        this.extraHosts = extraHosts == null ? Set.of()
                : Arrays.stream(extraHosts.split(","))
                        .map(HostAndPort::parse)
                        .flatMap(Optional::stream)
                        .collect(Collectors.toUnmodifiableSet());
        this.errorWriter = errorWriter;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!isAllowed(request)) {
            errorWriter.write(response, HttpStatus.FORBIDDEN, "Host no permitido");
            return;
        }
        chain.doFilter(request, response);
    }

    boolean isAllowed(HttpServletRequest request) {
        // HTTP/1.1 always has Host; without it (HTTP/1.0) the container's server name is used.
        String header = request.getHeader(HttpHeaders.HOST);
        String value = header != null ? header : request.getServerName();
        return HostAndPort.parse(value).map(host -> isAllowed(host, request.getLocalPort())).orElse(false);
    }

    boolean isAllowed(HostAndPort requested, int serverPort) {
        boolean portOk = requested.port() == null || requested.port() == serverPort;
        if (LOCAL_HOSTS.contains(requested.host()) && portOk) {
            return true;
        }
        for (HostAndPort allowed : extraHosts) {
            if (!allowed.host().equals(requested.host())) {
                continue;
            }
            if (allowed.port() == null ? portOk : allowed.port().equals(requested.port())) {
                return true;
            }
        }
        return false;
    }
}
