package com.gastosapp.backend.expense;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gastosapp.backend.category.Category;
import com.gastosapp.backend.category.CategoryService;
import com.gastosapp.backend.common.ApiException;
import com.gastosapp.backend.common.Money;
import com.gastosapp.backend.common.PageResponse;
import com.gastosapp.backend.config.DataSourceConfig;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseCreateRequest;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseFilter;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseResponse;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseResult;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseUpdateRequest;
import com.gastosapp.backend.limit.LimitService;

import jakarta.persistence.criteria.Predicate;

@Service
public class ExpenseService {

    private static final char LIKE_ESCAPE = '\\';

    /** Fixed order: newest date first, then newest id first. */
    private static final Sort SORT = Sort.by(Sort.Order.desc("date"), Sort.Order.desc("id"));

    private final ExpenseRepository expenseRepository;
    private final TagRepository tagRepository;
    private final CategoryService categoryService;
    private final LimitService limitService;
    private final Clock clock;

    public ExpenseService(ExpenseRepository expenseRepository, TagRepository tagRepository,
            CategoryService categoryService, LimitService limitService, Clock clock) {
        this.expenseRepository = expenseRepository;
        this.tagRepository = tagRepository;
        this.categoryService = categoryService;
        this.limitService = limitService;
        this.clock = clock;
    }

    @Transactional
    public ExpenseResult create(Long userId, ExpenseCreateRequest request) {
        Category category = categoryService.getOwned(userId, request.categoryId());
        Expense expense = expenseRepository.save(new Expense(userId, category, Money.toCents(request.amount()),
                request.description(), request.date(), resolveTags(userId, request.tags()),
                LocalDateTime.now(clock)));
        return toResult(userId, expense);
    }

    @Transactional
    public ExpenseResult update(Long userId, Long id, ExpenseUpdateRequest request) {
        Expense expense = getOwned(userId, id);
        Category category = categoryService.getOwned(userId, request.categoryId());
        expense.update(category, Money.toCents(request.amount()), request.description(),
                resolveTags(userId, request.tags()), LocalDateTime.now(clock));
        return toResult(userId, expense);
    }

    @Transactional(readOnly = true)
    public ExpenseResponse get(Long userId, Long id) {
        return ExpenseResponse.from(getOwned(userId, id));
    }

    @Transactional
    public void delete(Long userId, Long id) {
        expenseRepository.delete(getOwned(userId, id));
    }

    @Transactional(readOnly = true)
    public PageResponse<ExpenseResponse> search(Long userId, ExpenseFilter filter) {
        Page<Expense> page = expenseRepository.findAll(matching(userId, filter),
                PageRequest.of(filter.pageOrDefault(), filter.sizeOrDefault(), SORT));
        return new PageResponse<>(page.getContent().stream().map(ExpenseResponse::from).toList(),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }

    private ExpenseResult toResult(Long userId, Expense expense) {
        // Flush so the limit totals below include this change.
        expenseRepository.flush();
        return new ExpenseResult(ExpenseResponse.from(expense), limitService.exceededFor(userId, expense.getDate()));
    }

    private Expense getOwned(Long userId, Long id) {
        return expenseRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> ApiException.notFound("Gasto no encontrado"));
    }

    /** Existing tags of the user are reused; missing ones are created on the fly. */
    private Set<Tag> resolveTags(Long userId, List<String> names) {
        if (names.isEmpty()) {
            return Set.of();
        }
        Set<Tag> tags = new HashSet<>(tagRepository.findByUserIdAndNameIn(userId, names));
        Set<String> existing = new HashSet<>();
        tags.forEach(tag -> existing.add(tag.getName()));
        for (String name : names) {
            if (!existing.contains(name)) {
                tags.add(tagRepository.save(new Tag(userId, name)));
            }
        }
        return tags;
    }

    private static Specification<Expense> matching(Long userId, ExpenseFilter filter) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("userId"), userId));

            if (filter.description() != null && !filter.description().isBlank()) {
                String pattern = "%" + escapeLike(filter.description().strip().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.like(
                        cb.function(DataSourceConfig.UNICODE_LOWER, String.class, root.get("description")),
                        pattern, LIKE_ESCAPE));
            }
            if (filter.categoryId() != null) {
                predicates.add(cb.equal(root.get("category").get("id"), filter.categoryId()));
            }
            if (filter.startDate() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("date"), filter.startDate()));
            }
            if (filter.endDate() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("date"), filter.endDate()));
            }
            if (filter.tag() != null && !filter.tag().isBlank()) {
                // A tag name is unique per user, so this join never duplicates an expense.
                predicates.add(cb.equal(root.join("tags").get("name"), ExpenseDtos.normalizeTag(filter.tag())));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
