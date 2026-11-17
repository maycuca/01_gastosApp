package com.gastosapp.backend.security;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

import com.gastosapp.backend.config.DirectoryProperties;
import com.gastosapp.backend.config.JwtProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;

/**
 * Issues and verifies stateless HS256 tokens. Each token carries a {@code pwd}
 * claim ({@link PasswordFingerprint}) so that changing the password invalidates
 * the tokens issued before; the check against the current hash is done by
 * {@link JwtAuthenticationFilter}.
 */
@Service
public class JwtService {

    private static final String USERNAME_CLAIM = "username";

    public static final String PASSWORD_CLAIM = "pwd";

    /** Data of a token whose signature and expiry are valid. */
    public record VerifiedToken(Long userId, String passwordFingerprint) {
    }

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final JwtProperties properties;
    private final Clock clock;

    public JwtService(JwtProperties properties, DirectoryProperties directories, Clock clock) {
        byte[] secret = JwtSecretStore.resolve(properties.secret(),
                directories.dataDir().resolve(DirectoryProperties.JWT_SECRET_FILE));
        SecretKey key = new SecretKeySpec(secret, "HmacSHA256");
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        this.properties = properties;
        this.clock = clock;
    }

    public String issue(Long userId, String username, String passwordHash) {
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(String.valueOf(userId))
                .claim(USERNAME_CLAIM, username)
                .claim(PASSWORD_CLAIM, PasswordFingerprint.of(passwordHash))
                .issuedAt(now)
                .expiresAt(now.plus(properties.expiration()))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    /**
     * Returns the user id and {@code pwd} claim of the token, or empty when it is
     * malformed, tampered, expired or has no {@code pwd} claim.
     */
    public Optional<VerifiedToken> verify(String token) {
        try {
            Jwt jwt = decoder.decode(token);
            if (!(jwt.getClaims().get(PASSWORD_CLAIM) instanceof String fingerprint) || fingerprint.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(new VerifiedToken(Long.valueOf(jwt.getSubject()), fingerprint));
        } catch (JwtException | IllegalArgumentException ex) {
            return Optional.empty();
        }
    }
}
