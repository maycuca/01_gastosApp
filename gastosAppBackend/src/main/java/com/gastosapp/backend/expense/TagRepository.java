package com.gastosapp.backend.expense;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TagRepository extends JpaRepository<Tag, Long> {

    List<Tag> findByUserIdAndNameIn(Long userId, Collection<String> names);
}
