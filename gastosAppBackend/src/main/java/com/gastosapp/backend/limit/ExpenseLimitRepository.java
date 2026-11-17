package com.gastosapp.backend.limit;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.gastosapp.backend.period.Period;

public interface ExpenseLimitRepository extends JpaRepository<ExpenseLimit, Long> {

    List<ExpenseLimit> findByUserId(Long userId);

    Optional<ExpenseLimit> findByUserIdAndPeriod(Long userId, Period period);
}
