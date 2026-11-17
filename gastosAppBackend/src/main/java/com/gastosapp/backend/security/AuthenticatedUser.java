package com.gastosapp.backend.security;

/** Principal placed in the security context for a valid token. */
public record AuthenticatedUser(Long id, String username) {
}
