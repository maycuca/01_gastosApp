package com.gastosapp.backend.security;

import java.io.IOException;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.gastosapp.backend.auth.UserRepository;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Authenticates the request from "Authorization: Bearer &lt;token&gt;". Anything
 * else (missing, invalid or expired token, token without {@code pwd} claim or
 * issued before the last password change, user that no longer exists) leaves
 * the request unauthenticated, which ends in a 401 for protected endpoints.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            jwtService.verify(header.substring(BEARER_PREFIX.length()).trim())
                    .flatMap(token -> userRepository.findById(token.userId())
                            .filter(user -> PasswordFingerprint.matches(token.passwordFingerprint(),
                                    user.getPasswordHash())))
                    .ifPresent(user -> SecurityContextHolder.getContext().setAuthentication(
                            UsernamePasswordAuthenticationToken.authenticated(
                                    new AuthenticatedUser(user.getId(), user.getUsername()), null, List.of())));
        }
        chain.doFilter(request, response);
    }
}
