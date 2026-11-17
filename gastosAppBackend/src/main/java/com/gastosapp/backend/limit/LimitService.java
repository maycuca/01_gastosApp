package com.gastosapp.backend.limit;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gastosapp.backend.common.ApiException;
import com.gastosapp.backend.common.Money;
import com.gastosapp.backend.expense.ExpenseRepository;
import com.gastosapp.backend.limit.LimitDtos.ExceededLimit;
import com.gastosapp.backend.limit.LimitDtos.LimitRequest;
import com.gastosapp.backend.limit.LimitDtos.LimitResponse;
import com.gastosapp.backend.period.DateRange;
import com.gastosapp.backend.period.Period;
import com.gastosapp.backend.period.PeriodCalculator;

@Service
public class LimitService {

    private final ExpenseLimitRepository limitRepository;
    private final ExpenseRepository expenseRepository;
    private final PeriodCalculator periodCalculator;
    private final Clock clock;

    public LimitService(ExpenseLimitRepository limitRepository, ExpenseRepository expenseRepository,
            PeriodCalculator periodCalculator, Clock clock) {
        this.limitRepository = limitRepository;
        this.expenseRepository = expenseRepository;
        this.periodCalculator = periodCalculator;
        this.clock = clock;
    }

    /** A limit is exceeded only when the amount spent is strictly greater than it. */
    public static boolean isExceeded(long spentCents, long limitCents) {
        return spentCents > limitCents;
    }

    @Transactional(readOnly = true)
    public List<LimitResponse> list(Long userId) {
        return sortedLimits(userId).stream().map(limit -> toResponse(userId, limit)).toList();
    }

    @Transactional
    public LimitResponse put(Long userId, Period period, LimitRequest request) {
        long limitCents = Money.toCents(request.limitAmount());
        LocalDateTime now = LocalDateTime.now(clock);
        ExpenseLimit limit = limitRepository.findByUserIdAndPeriod(userId, period)
                .map(existing -> {
                    existing.replace(limitCents, now);
                    return existing;
                })
                .orElseGet(() -> limitRepository.save(new ExpenseLimit(userId, period, limitCents, now)));
        return toResponse(userId, limit);
    }

    @Transactional
    public void delete(Long userId, Period period) {
        ExpenseLimit limit = limitRepository.findByUserIdAndPeriod(userId, period)
                .orElseThrow(() -> ApiException.notFound("Límite no encontrado"));
        limitRepository.delete(limit);
    }

    /**
     * Limits that are exceeded in the periods containing {@code date} (the date of
     * an expense that was just created or edited).
     */
    @Transactional(readOnly = true)
    public List<ExceededLimit> exceededFor(Long userId, LocalDate date) {
        return sortedLimits(userId).stream()
                .map(limit -> {
                    DateRange range = periodCalculator.containing(limit.getPeriod(), date);
                    long spent = expenseRepository.sumAmountCents(userId, range.from(), range.to());
                    return isExceeded(spent, limit.getLimitCents())
                            ? new ExceededLimit(limit.getPeriod(), Money.toAmount(limit.getLimitCents()),
                                    Money.toAmount(spent))
                            : null;
                })
                .filter(exceeded -> exceeded != null)
                .toList();
    }

    private List<ExpenseLimit> sortedLimits(Long userId) {
        return limitRepository.findByUserId(userId).stream()
                .sorted(Comparator.comparing(ExpenseLimit::getPeriod))
                .toList();
    }

    private LimitResponse toResponse(Long userId, ExpenseLimit limit) {
        DateRange range = periodCalculator.current(limit.getPeriod());
        long spent = expenseRepository.sumAmountCents(userId, range.from(), range.to());
        return new LimitResponse(limit.getPeriod(), Money.toAmount(limit.getLimitCents()), Money.toAmount(spent),
                Money.toAmount(limit.getLimitCents() - spent), isExceeded(spent, limit.getLimitCents()));
    }
}
