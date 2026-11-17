package com.gastosapp.backend.expense;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

import com.gastosapp.backend.category.CategoryDtos.CategoryResponse;
import com.gastosapp.backend.common.Money;
import com.gastosapp.backend.limit.LimitDtos.ExceededLimit;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public final class ExpenseDtos {

    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;
    /** Upper bound for {@code page}, so the row offset never overflows (100000 x 100 rows). */
    public static final int MAX_PAGE = 100_000;

    private static final String REQUIRED = "Campo obligatorio";
    private static final String AMOUNT_POSITIVE = "Debe ser mayor a 0";
    private static final String AMOUNT_DIGITS = "Debe tener como máximo 12 dígitos enteros y 2 decimales";
    private static final String DESCRIPTION_SIZE = "Debe tener entre 1 y 255 caracteres";
    private static final String TAGS_SIZE = "Máximo 10 etiquetas por gasto";
    private static final String TAG_SIZE = "Cada etiqueta debe tener entre 1 y 30 caracteres";

    private ExpenseDtos() {
    }

    public record ExpenseCreateRequest(
            @NotNull(message = REQUIRED)
            @Positive(message = AMOUNT_POSITIVE)
            @Digits(integer = 12, fraction = 2, message = AMOUNT_DIGITS)
            BigDecimal amount,

            @NotBlank(message = REQUIRED)
            @Size(max = 255, message = DESCRIPTION_SIZE)
            String description,

            @NotNull(message = REQUIRED)
            @PastOrPresent(message = "No puede ser una fecha futura")
            LocalDate date,

            @NotNull(message = REQUIRED)
            Long categoryId,

            @Size(max = 10, message = TAGS_SIZE)
            List<@NotBlank(message = TAG_SIZE) @Size(max = 30, message = TAG_SIZE) String> tags) {

        public ExpenseCreateRequest {
            description = strip(description);
            tags = normalizeTags(tags);
        }
    }

    /** No {@code date}: it is immutable, and if the client sends it, it is ignored. */
    public record ExpenseUpdateRequest(
            @NotNull(message = REQUIRED)
            @Positive(message = AMOUNT_POSITIVE)
            @Digits(integer = 12, fraction = 2, message = AMOUNT_DIGITS)
            BigDecimal amount,

            @NotBlank(message = REQUIRED)
            @Size(max = 255, message = DESCRIPTION_SIZE)
            String description,

            @NotNull(message = REQUIRED)
            Long categoryId,

            @Size(max = 10, message = TAGS_SIZE)
            List<@NotBlank(message = TAG_SIZE) @Size(max = 30, message = TAG_SIZE) String> tags) {

        public ExpenseUpdateRequest {
            description = strip(description);
            tags = normalizeTags(tags);
        }
    }

    /** Query parameters of GET /api/expenses; all optional and combinable. */
    public record ExpenseFilter(
            String description,
            Long categoryId,
            LocalDate startDate,
            LocalDate endDate,
            String tag,
            @Min(value = 0, message = "Debe estar entre 0 y 100000")
            @Max(value = MAX_PAGE, message = "Debe estar entre 0 y 100000")
            Integer page,
            @Min(value = 1, message = "Debe estar entre 1 y 100")
            @Max(value = MAX_PAGE_SIZE, message = "Debe estar entre 1 y 100")
            Integer size) {

        public int pageOrDefault() {
            return page == null ? 0 : page;
        }

        public int sizeOrDefault() {
            return size == null ? DEFAULT_PAGE_SIZE : size;
        }
    }

    public record ExpenseResponse(Long id, BigDecimal amount, String description, LocalDate date,
            CategoryResponse category, List<String> tags) {

        public static ExpenseResponse from(Expense expense) {
            return new ExpenseResponse(
                    expense.getId(),
                    Money.toAmount(expense.getAmountCents()),
                    expense.getDescription(),
                    expense.getDate(),
                    CategoryResponse.from(expense.getCategory()),
                    expense.getTags().stream().map(Tag::getName).sorted().toList());
        }
    }

    /** Response of create and update. */
    public record ExpenseResult(ExpenseResponse expense, List<ExceededLimit> exceededLimits) {
    }

    /** Tag names are stored lower-cased and stripped; an omitted list means no tags. */
    public static List<String> normalizeTags(List<String> tags) {
        if (tags == null) {
            return List.of();
        }
        return tags.stream().map(ExpenseDtos::normalizeTag).distinct().toList();
    }

    public static String normalizeTag(String tag) {
        return tag == null ? "" : tag.strip().toLowerCase(Locale.ROOT);
    }

    private static String strip(String value) {
        return value == null ? null : value.strip();
    }
}
