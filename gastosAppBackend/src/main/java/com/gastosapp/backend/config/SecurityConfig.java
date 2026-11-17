package com.gastosapp.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer.FrameOptionsConfig;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.HeaderWriterFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;

import com.gastosapp.backend.auth.UserRepository;
import com.gastosapp.backend.security.ApiErrorWriter;
import com.gastosapp.backend.security.HostValidationFilter;
import com.gastosapp.backend.security.JwtAuthenticationFilter;
import com.gastosapp.backend.security.JwtService;
import com.gastosapp.backend.security.StaticMethodFilter;

import jakarta.servlet.DispatcherType;

@Configuration
public class SecurityConfig {

    /** The frontend is a Vite build: external scripts and styles from the same origin, no inline scripts. */
    public static final String CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; "
            + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; "
            + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtService jwtService,
            UserRepository userRepository, ApiErrorWriter errorWriter,
            @Value("${app.security.allowed-hosts:}") String allowedHosts) throws Exception {
        // Created here (not as beans) so the servlet container does not register them a second time.
        // Being part of the security chain they also run in MockMvc tests.
        JwtAuthenticationFilter jwtFilter = new JwtAuthenticationFilter(jwtService, userRepository);
        HostValidationFilter hostFilter = new HostValidationFilter(allowedHosts, errorWriter);
        StaticMethodFilter staticMethodFilter = new StaticMethodFilter(errorWriter);

        http
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Security headers on every response (API, frontend and errors).
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives(CONTENT_SECURITY_POLICY))
                        .contentTypeOptions(Customizer.withDefaults())
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER))
                        .frameOptions(FrameOptionsConfig::deny))
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers("/api", "/api/**").authenticated()
                        // Compiled frontend (static files and index.html for interface routes);
                        // StaticMethodFilter already turned away every method except GET and HEAD.
                        .anyRequest().permitAll())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint((request, response, ex) -> errorWriter.write(response,
                                HttpStatus.UNAUTHORIZED, "Token ausente, inválido o vencido"))
                        .accessDeniedHandler((request, response, ex) -> errorWriter.write(response,
                                HttpStatus.FORBIDDEN, "Acceso denegado")))
                // After HeaderWriterFilter, so the 403 and 405 written by these filters carry the headers too.
                .addFilterAfter(hostFilter, HeaderWriterFilter.class)
                .addFilterAfter(staticMethodFilter, HostValidationFilter.class)
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** Authentication is JWT-only; this bean just switches off Spring Boot's default in-memory user. */
    @Bean
    public UserDetailsService userDetailsService() {
        return username -> {
            throw new UsernameNotFoundException(username);
        };
    }
}
