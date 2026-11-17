package com.gastosapp.backend.expense;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExpenseRepository extends JpaRepository<Expense, Long>, JpaSpecificationExecutor<Expense> {

    /** Date, category and amount of one expense; enough to build every dashboard aggregate. */
    record ExpenseSlice(LocalDate date, Long categoryId, long amountCents) {
    }

    Optional<Expense> findByIdAndUserId(Long id, Long userId);

    /** Total spent by the user in the inclusive date range, in cents (0 when there are no expenses). */
    @Query("""
            select coalesce(sum(e.amountCents), 0) from Expense e
            where e.userId = :userId and e.date >= :from and e.date <= :to
            """)
    long sumAmountCents(@Param("userId") Long userId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select new com.gastosapp.backend.expense.ExpenseRepository$ExpenseSlice(e.date, e.category.id, e.amountCents)
            from Expense e
            where e.userId = :userId and e.date >= :from and e.date <= :to
            """)
    List<ExpenseSlice> findSlices(@Param("userId") Long userId, @Param("from") LocalDate from,
            @Param("to") LocalDate to);
}
