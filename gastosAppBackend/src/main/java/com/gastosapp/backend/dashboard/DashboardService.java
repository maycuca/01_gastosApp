package com.gastosapp.backend.dashboard;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gastosapp.backend.category.Category;
import com.gastosapp.backend.category.CategoryRepository;
import com.gastosapp.backend.common.Money;
import com.gastosapp.backend.dashboard.DashboardDtos.BreakdownPoint;
import com.gastosapp.backend.dashboard.DashboardDtos.CategoryAmount;
import com.gastosapp.backend.dashboard.DashboardDtos.LimitSummary;
import com.gastosapp.backend.dashboard.DashboardDtos.SummaryResponse;
import com.gastosapp.backend.expense.ExpenseRepository;
import com.gastosapp.backend.expense.ExpenseRepository.ExpenseSlice;
import com.gastosapp.backend.limit.ExpenseLimitRepository;
import com.gastosapp.backend.limit.LimitService;
import com.gastosapp.backend.period.DateRange;
import com.gastosapp.backend.period.Period;
import com.gastosapp.backend.period.PeriodCalculator;

@Service
public class DashboardService {

    private final ExpenseRepository expenseRepository;
    private final CategoryRepository categoryRepository;
    private final ExpenseLimitRepository limitRepository;
    private final PeriodCalculator periodCalculator;

    public DashboardService(ExpenseRepository expenseRepository, CategoryRepository categoryRepository,
            ExpenseLimitRepository limitRepository, PeriodCalculator periodCalculator) {
        this.expenseRepository = expenseRepository;
        this.categoryRepository = categoryRepository;
        this.limitRepository = limitRepository;
        this.periodCalculator = periodCalculator;
    }

    @Transactional(readOnly = true)
    public SummaryResponse summary(Long userId, Period period) {
        DateRange range = periodCalculator.current(period);
        DateRange previousRange = periodCalculator.previous(period, range);

        List<ExpenseSlice> slices = expenseRepository.findSlices(userId, range.from(), range.to());
        long total = slices.stream().mapToLong(ExpenseSlice::amountCents).sum();
        long previousTotal = expenseRepository.sumAmountCents(userId, previousRange.from(), previousRange.to());

        BigDecimal changePercentage = previousTotal == 0 ? null : Money.percentage(total - previousTotal, previousTotal);

        LimitSummary limit = limitRepository.findByUserIdAndPeriod(userId, period)
                .map(found -> new LimitSummary(
                        Money.toAmount(found.getLimitCents()),
                        Money.toAmount(found.getLimitCents() - total),
                        Money.percentage(total, found.getLimitCents()),
                        LimitService.isExceeded(total, found.getLimitCents())))
                .orElse(null);

        return new SummaryResponse(period, range.from(), range.to(), Money.toAmount(total),
                Money.toAmount(previousTotal), changePercentage, limit,
                byCategory(userId, slices, total), breakdown(period, range, slices));
    }

    /** Only categories with spending, highest amount first. */
    private List<CategoryAmount> byCategory(Long userId, List<ExpenseSlice> slices, long total) {
        if (slices.isEmpty()) {
            return List.of();
        }
        Map<Long, Category> categories = categoryRepository.findByUserId(userId).stream()
                .collect(Collectors.toMap(Category::getId, Function.identity()));
        Map<Long, Long> centsByCategory = new HashMap<>();
        slices.forEach(slice -> centsByCategory.merge(slice.categoryId(), slice.amountCents(), Long::sum));

        return centsByCategory.entrySet().stream()
                .map(entry -> {
                    Category category = categories.get(entry.getKey());
                    return new CategoryAmount(category.getId(), category.getName(), category.getColor(),
                            Money.toAmount(entry.getValue()), Money.percentage(entry.getValue(), total));
                })
                .sorted(Comparator.comparing(CategoryAmount::amount).reversed()
                        .thenComparing(CategoryAmount::name))
                .toList();
    }

    /**
     * WEEK, FORTNIGHT and MONTH: one point per day. YEAR: one point per month
     * (label YYYY-MM). DAY: empty. Days or months without expenses carry 0.
     */
    private static List<BreakdownPoint> breakdown(Period period, DateRange range, List<ExpenseSlice> slices) {
        Map<String, Long> centsByLabel = new LinkedHashMap<>();
        Function<LocalDate, String> labelOf;
        switch (period) {
            case DAY -> {
                return List.of();
            }
            case YEAR -> {
                labelOf = date -> YearMonth.from(date).toString();
                for (YearMonth month = YearMonth.from(range.from()); !month.isAfter(YearMonth.from(range.to()));
                        month = month.plusMonths(1)) {
                    centsByLabel.put(month.toString(), 0L);
                }
            }
            case WEEK, FORTNIGHT, MONTH -> {
                labelOf = LocalDate::toString;
                range.from().datesUntil(range.to().plusDays(1)).forEach(date -> centsByLabel.put(date.toString(), 0L));
            }
            default -> throw new IllegalStateException("Unsupported period: " + period);
        }
        slices.forEach(slice -> centsByLabel.merge(labelOf.apply(slice.date()), slice.amountCents(), Long::sum));
        return centsByLabel.entrySet().stream()
                .map(entry -> new BreakdownPoint(entry.getKey(), Money.toAmount(entry.getValue())))
                .toList();
    }
}
