package com.gastosapp.backend.auth;

import java.util.Locale;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    /** {@code key} must already be lower-cased; see {@link #findByUsernameIgnoreCase(String)}. */
    @Query("select u from User u where function('unicode_lower', u.username) = :key")
    Optional<User> findByUsernameKey(@Param("key") String key);

    default Optional<User> findByUsernameIgnoreCase(String username) {
        return findByUsernameKey(username.toLowerCase(Locale.ROOT));
    }
}
