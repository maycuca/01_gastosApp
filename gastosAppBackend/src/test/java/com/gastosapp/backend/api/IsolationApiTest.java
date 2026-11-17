package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Spec section 1 ("Aislamiento entre usuarios") and section 6: other users' resources answer 404. */
class IsolationApiTest extends ApiTestSupport {

    private Session ana;
    private Session beto;
    private long anaCategory;
    private long anaExpense;

    @BeforeEach
    void setUpUsers() throws Exception {
        ana = register();
        beto = register();
        anaCategory = categoryId(ana, "Comida");
        anaExpense = createExpenseId(ana, "150.50", "Almuerzo de Ana", TODAY, anaCategory, "privado");
    }

    @Test
    void anotherUserCannotSeeAnExpense() throws Exception {
        assertPlainError(doGet(beto, "/api/expenses/" + anaExpense), 404, "Not Found");

        Reply list = doGet(beto, "/api/expenses").expect(200);
        assertThat(list.<Integer>read("$.totalElements")).isZero();
        doGet(ana, "/api/expenses/" + anaExpense).expect(200);
    }

    @Test
    void anotherUserCannotEditAnExpense() throws Exception {
        long betoCategory = categoryId(beto, "Comida");

        Reply reply = doPut(beto, "/api/expenses/" + anaExpense,
                expenseBody("1.00", "Hackeado", null, betoCategory, List.of()));

        assertPlainError(reply, 404, "Not Found");
        Reply unchanged = doGet(ana, "/api/expenses/" + anaExpense).expect(200);
        assertThat(unchanged.<String>read("$.description")).isEqualTo("Almuerzo de Ana");
        assertThat(unchanged.decimal("$.amount")).isEqualByComparingTo("150.50");
    }

    @Test
    void anotherUserCannotDeleteAnExpense() throws Exception {
        assertPlainError(doDelete(beto, "/api/expenses/" + anaExpense), 404, "Not Found");

        doGet(ana, "/api/expenses/" + anaExpense).expect(200);
    }

    @Test
    void anotherUsersCategoryCannotBeUsedInAnExpense() throws Exception {
        Reply create = doPost(beto, "/api/expenses", expenseBody("10.00", "Con categoría ajena", TODAY, anaCategory,
                List.of()));
        assertPlainError(create, 404, "Not Found");

        long betoCategory = categoryId(beto, "Comida");
        long betoExpense = createExpenseId(beto, "10.00", "Propio", TODAY, betoCategory);
        Reply update = doPut(beto, "/api/expenses/" + betoExpense,
                expenseBody("10.00", "Propio", null, anaCategory, List.of()));
        assertPlainError(update, 404, "Not Found");
    }

    @Test
    void nonexistentCategoryInAnExpenseAnswers404() throws Exception {
        Reply create = doPost(ana, "/api/expenses",
                expenseBody("10.00", "Sin categoría", TODAY, 999_999_999L, List.of()));

        assertPlainError(create, 404, "Not Found");
    }

    @Test
    void anotherUserCannotSeeOrEditACategory() throws Exception {
        Number created = doPost(ana, "/api/categories", Map.of("name", "Mascotas de Ana", "color", "#112233"))
                .expect(201).read("$.id");

        Reply update = doPut(beto, "/api/categories/" + created,
                Map.of("name", "Robada", "color", "#000000"));
        assertPlainError(update, 404, "Not Found");

        List<String> betoNames = doGet(beto, "/api/categories").expect(200).read("$[*].name");
        assertThat(betoNames).doesNotContain("Mascotas de Ana").hasSize(7);
        List<Number> betoIds = doGet(beto, "/api/categories").read("$[*].id");
        assertThat(betoIds.stream().map(Number::longValue)).doesNotContain(anaCategory, created.longValue());
        List<String> anaNames = doGet(ana, "/api/categories").expect(200).read("$[*].name");
        assertThat(anaNames).contains("Mascotas de Ana").doesNotContain("Robada");
    }

    @Test
    void twoUsersCanUseTheSameCategoryNameAndTag() throws Exception {
        doPost(ana, "/api/categories", Map.of("name", "Compartida", "color", "#112233")).expect(201);
        doPost(beto, "/api/categories", Map.of("name", "Compartida", "color", "#445566")).expect(201);

        long betoCategory = categoryId(beto, "Comida");
        createExpense(beto, "5.00", "De Beto", TODAY, betoCategory, "privado");

        Reply anaByTag = doGet(ana, "/api/expenses?tag=privado").expect(200);
        assertThat(anaByTag.<List<String>>read("$.content[*].description")).containsExactly("Almuerzo de Ana");
        Reply betoByTag = doGet(beto, "/api/expenses?tag=privado").expect(200);
        assertThat(betoByTag.<List<String>>read("$.content[*].description")).containsExactly("De Beto");
    }

    @Test
    void limitsAreIsolatedPerUser() throws Exception {
        putLimit(ana, "MONTH", "100.00").expect(200);

        Reply betoLimits = doGet(beto, "/api/limits").expect(200);
        assertThat(betoLimits.<List<Object>>read("$")).isEmpty();
        assertPlainError(doDelete(beto, "/api/limits/MONTH"), 404, "Not Found");

        // Beto fixing his own MONTH limit must not replace Ana's.
        putLimit(beto, "MONTH", "7.00").expect(200);
        Reply anaLimits = doGet(ana, "/api/limits").expect(200);
        assertThat(anaLimits.<List<Object>>read("$")).hasSize(1);
        assertThat(anaLimits.decimal("$[0].limitAmount")).isEqualByComparingTo("100.00");
        assertThat(anaLimits.decimal("$[0].spent")).isEqualByComparingTo("150.50");
        Reply betoAfter = doGet(beto, "/api/limits").expect(200);
        assertThat(betoAfter.decimal("$[0].spent")).isEqualByComparingTo("0.00");

        // Ana's limit never shows up as exceeded for Beto's expenses.
        long betoCategory = categoryId(beto, "Comida");
        Reply betoExpense = createExpense(beto, "5.00", "De Beto", TODAY, betoCategory);
        assertThat(betoExpense.<List<Object>>read("$.exceededLimits")).isEmpty();
    }

    @Test
    void dashboardOnlyCountsTheOwnExpenses() throws Exception {
        Reply betoSummary = summary(beto, "MONTH");

        assertThat(betoSummary.decimal("$.totalSpent")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(betoSummary.<List<Object>>read("$.byCategory")).isEmpty();
        assertThat(summary(ana, "MONTH").decimal("$.totalSpent")).isEqualByComparingTo("150.50");
    }

    @Test
    void ownerComesFromTheTokenNotFromTheBody() throws Exception {
        long betoCategory = categoryId(beto, "Comida");
        Map<String, Object> body = new LinkedHashMap<>(expenseBody("9.00", "Con userId ajeno", TODAY, betoCategory,
                List.of()));
        body.put("userId", ana.userId());

        Number id = doPost(beto, "/api/expenses", body).expect(201).read("$.expense.id");

        doGet(beto, "/api/expenses/" + id).expect(200);
        assertPlainError(doGet(ana, "/api/expenses/" + id), 404, "Not Found");
        Long owner = jdbc.queryForObject("select user_id from expenses where id = ?", Long.class, id.longValue());
        assertThat(owner).isEqualTo(beto.userId());
    }

    @Test
    void nonexistentExpenseAnswers404() throws Exception {
        assertPlainError(doGet(ana, "/api/expenses/999999999"), 404, "Not Found");
        assertPlainError(doDelete(ana, "/api/expenses/999999999"), 404, "Not Found");
        assertPlainError(doPut(ana, "/api/expenses/999999999",
                expenseBody("1.00", "No existe", null, anaCategory, List.of())), 404, "Not Found");
    }
}
