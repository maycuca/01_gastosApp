package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Spec sections 2 (Expense, Tag), 3 (Gastos) and 6 (Gastos). */
class ExpenseApiTest extends ApiTestSupport {

    private Session user;
    private long comida;
    private long transporte;

    @BeforeEach
    void setUpUser() throws Exception {
        user = register();
        comida = categoryId(user, "Comida");
        transporte = categoryId(user, "Transporte");
    }

    // ---------- Create ----------

    @Test
    void createsAnExpenseWithTheSpecShape() throws Exception {
        Reply reply = doPost(user, "/api/expenses",
                expenseBody("150.50", "Almuerzo", "2026-11-15", comida, List.of("trabajo")));

        reply.expect(201);
        Map<String, Object> body = reply.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("expense", "exceededLimits");
        assertThat(reply.<List<Object>>read("$.exceededLimits")).isEmpty();
        Map<String, Object> expense = reply.read("$.expense");
        assertThat(expense.keySet()).containsExactlyInAnyOrder("id", "amount", "description", "date", "category",
                "tags");
        assertThat(reply.decimal("$.expense.amount")).isEqualByComparingTo("150.50");
        assertThat(expense).containsEntry("description", "Almuerzo").containsEntry("date", "2026-11-15");
        Map<String, Object> category = reply.read("$.expense.category");
        assertThat(category.keySet()).containsExactlyInAnyOrder("id", "name", "color");
        assertThat(category).containsEntry("name", "Comida");
        assertThat(((Number) category.get("id")).longValue()).isEqualTo(comida);
        assertThat(reply.<List<String>>read("$.expense.tags")).containsExactly("trabajo");
        // The amount travels as a JSON number with 2 decimals, not as a string.
        assertThat(reply.body()).contains("\"amount\":150.50");
    }

    @Test
    void createdExpenseCanBeReadBackById() throws Exception {
        long id = createExpenseId(user, "99.99", "Taxi", TODAY.minusDays(3), transporte, "viaje");

        Reply reply = doGet(user, "/api/expenses/" + id).expect(200);

        Map<String, Object> expense = reply.read("$");
        assertThat(expense.keySet()).containsExactlyInAnyOrder("id", "amount", "description", "date", "category",
                "tags");
        assertThat(reply.decimal("$.amount")).isEqualByComparingTo("99.99");
        assertThat(expense).containsEntry("description", "Taxi").containsEntry("date", "2026-11-15");
        assertThat(reply.<String>read("$.category.name")).isEqualTo("Transporte");
        assertThat(reply.<List<String>>read("$.tags")).containsExactly("viaje");
    }

    @Test
    void tagsAreOptional() throws Exception {
        Reply reply = doPost(user, "/api/expenses", expenseBody("10.00", "Sin etiquetas", TODAY, comida, null));

        reply.expect(201);
        assertThat(reply.<List<String>>read("$.expense.tags")).isEmpty();
    }

    @Test
    void amountIsStoredAsIntegerCentsAndDateAsIsoText() throws Exception {
        long id = createExpenseId(user, "150.50", "Almuerzo", TODAY.minusDays(3), comida);

        Map<String, Object> row = jdbc.queryForMap(
                "select amount_cents, typeof(amount_cents) as amount_type, date, typeof(date) as date_type, user_id "
                        + "from expenses where id = ?", id);

        assertThat(((Number) row.get("amount_cents")).longValue()).isEqualTo(15050L);
        assertThat(row).containsEntry("amount_type", "integer").containsEntry("date", "2026-11-15")
                .containsEntry("date_type", "text");
        assertThat(((Number) row.get("user_id")).longValue()).isEqualTo(user.userId());
    }

    @Test
    void expenseDatedTodayIsAccepted() throws Exception {
        doPost(user, "/api/expenses", expenseBody("1.00", "Hoy", TODAY, comida, null)).expect(201);
    }

    // ---------- Validation ----------

    @ParameterizedTest
    @ValueSource(strings = { "0", "0.00", "-0.01", "-150.50" })
    void amountLessOrEqualToZeroAnswers400(String amount) throws Exception {
        Reply reply = doPost(user, "/api/expenses", expenseBody(amount, "Almuerzo", TODAY, comida, null));

        assertValidationError(reply, "amount");
    }

    @Test
    void amountWithMoreThanTwoDecimalsAnswers400() throws Exception {
        Reply reply = doPost(user, "/api/expenses", expenseBody("10.555", "Almuerzo", TODAY, comida, null));

        assertValidationError(reply, "amount");
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "   " })
    void emptyDescriptionAnswers400(String description) throws Exception {
        Reply reply = doPost(user, "/api/expenses", expenseBody("10.00", description, TODAY, comida, null));

        assertValidationError(reply, "description");
    }

    @Test
    void descriptionAcceptsUpTo255Characters() throws Exception {
        doPost(user, "/api/expenses", expenseBody("10.00", "a".repeat(255), TODAY, comida, null)).expect(201);

        Reply tooLong = doPost(user, "/api/expenses", expenseBody("10.00", "a".repeat(256), TODAY, comida, null));
        assertValidationError(tooLong, "description");
    }

    @Test
    void futureDateAnswers400() throws Exception {
        Reply reply = doPost(user, "/api/expenses",
                expenseBody("10.00", "Mañana", TODAY.plusDays(1), comida, null));

        assertValidationError(reply, "date");
    }

    @Test
    void missingRequiredFieldsAnswer400WithOneErrorPerField() throws Exception {
        Reply reply = doPost(user, "/api/expenses", "{}");

        assertValidationError(reply, "amount", "description", "date", "categoryId");
    }

    @Test
    void severalInvalidFieldsAreReportedTogether() throws Exception {
        Reply reply = doPost(user, "/api/expenses",
                expenseBody("0", "", TODAY.plusDays(30), comida, null));

        assertValidationError(reply, "amount", "description", "date");
        assertThat(reply.<List<String>>read("$.fieldErrors[?(@.field == 'amount')].message"))
                .containsExactly("Debe ser mayor a 0");
    }

    @Test
    void invalidExpensesAreNotSaved() throws Exception {
        doPost(user, "/api/expenses", expenseBody("-1", "Inválido", TODAY, comida, null)).expect(400);

        assertThat(doGet(user, "/api/expenses").expect(200).<Integer>read("$.totalElements")).isZero();
    }

    @Test
    void malformedValuesAnswer400AndNothingIsSaved() throws Exception {
        doPost(user, "/api/expenses", expenseBody("10.00", "Fecha imposible", "2026-13-45", comida, null))
                .expect(400);
        doPost(user, "/api/expenses",
                "{\"amount\":\"abc\",\"description\":\"x\",\"date\":\"2026-11-18\",\"categoryId\":" + comida + "}")
                .expect(400);
        doPost(user, "/api/expenses", "{no es json").expect(400);

        assertThat(doGet(user, "/api/expenses").expect(200).<Integer>read("$.totalElements")).isZero();
    }

    // ---------- Update ----------

    @Test
    void editChangesAmountDescriptionCategoryAndTags() throws Exception {
        long id = createExpenseId(user, "150.50", "Almuerzo", TODAY.minusDays(3), comida, "trabajo");

        Reply reply = doPut(user, "/api/expenses/" + id,
                expenseBody("80.25", "Taxi al aeropuerto", null, transporte, List.of("viaje", "empresa")));

        reply.expect(200);
        Map<String, Object> body = reply.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("expense", "exceededLimits");
        Reply stored = doGet(user, "/api/expenses/" + id).expect(200);
        for (Reply view : List.of(stored)) {
            assertThat(view.decimal("$.amount")).isEqualByComparingTo("80.25");
            assertThat(view.<String>read("$.description")).isEqualTo("Taxi al aeropuerto");
            assertThat(view.<String>read("$.category.name")).isEqualTo("Transporte");
            assertThat(view.<List<String>>read("$.tags")).containsExactlyInAnyOrder("viaje", "empresa");
            assertThat(view.<String>read("$.date")).isEqualTo("2026-11-15");
        }
        assertThat(reply.decimal("$.expense.amount")).isEqualByComparingTo("80.25");
        assertThat(reply.<Number>read("$.expense.id").longValue()).isEqualTo(id);
    }

    @Test
    void editIgnoresTheDateEvenIfItIsSent() throws Exception {
        long id = createExpenseId(user, "150.50", "Almuerzo", TODAY.minusDays(3), comida);

        Reply reply = doPut(user, "/api/expenses/" + id,
                expenseBody("150.50", "Almuerzo", "2026-01-01", comida, List.of()));

        reply.expect(200);
        assertThat(reply.<String>read("$.expense.date")).isEqualTo("2026-11-15");
        assertThat(doGet(user, "/api/expenses/" + id).<String>read("$.date")).isEqualTo("2026-11-15");
        assertThat(jdbc.queryForObject("select date from expenses where id = ?", String.class, id))
                .isEqualTo("2026-11-15");
    }

    @Test
    void editIgnoresEvenAFutureOrMalformedDate() throws Exception {
        long id = createExpenseId(user, "150.50", "Almuerzo", TODAY.minusDays(3), comida);

        doPut(user, "/api/expenses/" + id, expenseBody("150.50", "Almuerzo", "2099-12-31", comida, List.of()))
                .expect(200);
        doPut(user, "/api/expenses/" + id, expenseBody("150.50", "Almuerzo", "no-es-fecha", comida, List.of()))
                .expect(200);

        assertThat(doGet(user, "/api/expenses/" + id).<String>read("$.date")).isEqualTo("2026-11-15");
    }

    @Test
    void editWithoutTagsRemovesThem() throws Exception {
        long id = createExpenseId(user, "10.00", "Con etiquetas", TODAY, comida, "uno", "dos");

        doPut(user, "/api/expenses/" + id, expenseBody("10.00", "Con etiquetas", null, comida, null)).expect(200);

        assertThat(doGet(user, "/api/expenses/" + id).<List<String>>read("$.tags")).isEmpty();
    }

    @Test
    void editValidatesLikeCreate() throws Exception {
        long id = createExpenseId(user, "10.00", "Original", TODAY, comida);

        assertValidationError(doPut(user, "/api/expenses/" + id, expenseBody("0", "", null, comida, null)),
                "amount", "description");
        assertValidationError(doPut(user, "/api/expenses/" + id, "{}"), "amount", "description", "categoryId");

        Reply stored = doGet(user, "/api/expenses/" + id).expect(200);
        assertThat(stored.<String>read("$.description")).isEqualTo("Original");
        assertThat(stored.decimal("$.amount")).isEqualByComparingTo("10.00");
    }

    // ---------- Delete ----------

    @Test
    void deleteAnswers204AndTheExpenseDisappearsFromListAndDashboard() throws Exception {
        long kept = createExpenseId(user, "40.00", "Se queda", TODAY, comida);
        long removed = createExpenseId(user, "60.00", "Se va", TODAY, comida, "temporal");
        assertThat(summary(user, "MONTH").decimal("$.totalSpent")).isEqualByComparingTo("100.00");

        Reply reply = doDelete(user, "/api/expenses/" + removed);

        reply.expect(204);
        assertThat(reply.body()).isEmpty();
        assertPlainError(doGet(user, "/api/expenses/" + removed), 404, "Not Found");
        Reply list = doGet(user, "/api/expenses").expect(200);
        assertThat(list.<List<Number>>read("$.content[*].id").stream().map(Number::longValue))
                .containsExactly(kept);
        assertThat(list.<Integer>read("$.totalElements")).isEqualTo(1);
        for (String period : List.of("DAY", "WEEK", "FORTNIGHT", "MONTH", "YEAR")) {
            assertThat(summary(user, period).decimal("$.totalSpent")).as(period).isEqualByComparingTo("40.00");
        }
        assertThat(jdbc.queryForObject("select count(*) from expenses where id = ?", Integer.class, removed))
                .isZero();
        // Deleting twice: the expense no longer exists.
        assertPlainError(doDelete(user, "/api/expenses/" + removed), 404, "Not Found");
    }

    // ---------- Money ----------

    @Test
    void amountsAddUpExactly() throws Exception {
        createExpense(user, "0.10", "Diez centavos", TODAY, comida);
        createExpense(user, "0.20", "Veinte centavos", TODAY, comida);

        Reply day = summary(user, "DAY");

        assertThat(day.decimal("$.totalSpent")).isEqualTo(money("0.3"));
        assertThat(day.body()).contains("\"totalSpent\":0.30");
        assertThat(day.decimal("$.byCategory[0].amount")).isEqualByComparingTo("0.30");
        Reply list = doGet(user, "/api/expenses").expect(200);
        assertThat(list.body()).contains("\"amount\":0.10").contains("\"amount\":0.20");
    }

    @Test
    void amountsKeepTwoDecimalsAfterARoundTrip() throws Exception {
        for (String amount : List.of("0.01", "0.07", "1.10", "19.99", "1234567.89", "100")) {
            long id = createExpenseId(user, amount, "Monto " + amount, TODAY, comida);
            Reply stored = doGet(user, "/api/expenses/" + id).expect(200);
            assertThat(stored.decimal("$.amount")).as(amount).isEqualByComparingTo(amount);
        }
        // 0.01 + 0.07 + 1.10 + 19.99 + 1234567.89 + 100
        assertThat(summary(user, "DAY").decimal("$.totalSpent")).isEqualByComparingTo("1234689.06");
    }

    // ---------- Tags ----------

    @Test
    void tagsAreStoredLowercaseAndTrimmed() throws Exception {
        Reply reply = createExpense(user, "10.00", "Etiquetas", TODAY, comida, "  Trabajo ", "VIAJE");

        assertThat(reply.<List<String>>read("$.expense.tags")).containsExactlyInAnyOrder("trabajo", "viaje");
        List<String> stored = jdbc.queryForList("select name from tags where user_id = ? order by name",
                String.class, user.userId());
        assertThat(stored).containsExactly("trabajo", "viaje");
    }

    @Test
    void tagsAreCreatedOnceAndReused() throws Exception {
        createExpense(user, "10.00", "Uno", TODAY, comida, "trabajo");
        createExpense(user, "10.00", "Dos", TODAY, comida, "Trabajo ", "trabajo");

        Integer count = jdbc.queryForObject("select count(*) from tags where user_id = ? and name = 'trabajo'",
                Integer.class, user.userId());
        assertThat(count).isEqualTo(1);
        assertThat(doGet(user, "/api/expenses?tag=trabajo").expect(200).<Integer>read("$.totalElements"))
                .isEqualTo(2);
    }

    @Test
    void tenTagsAreAcceptedAndElevenAnswer400() throws Exception {
        List<String> ten = IntStream.rangeClosed(1, 10).mapToObj(i -> "etiqueta" + i).toList();
        List<String> eleven = new ArrayList<>(ten);
        eleven.add("etiqueta11");

        Reply accepted = doPost(user, "/api/expenses", expenseBody("10.00", "Diez", TODAY, comida, ten));
        accepted.expect(201);
        assertThat(accepted.<List<String>>read("$.expense.tags")).hasSize(10);

        Reply rejected = doPost(user, "/api/expenses", expenseBody("10.00", "Once", TODAY, comida, eleven));
        assertValidationError(rejected, "tags");

        long id = accepted.<Number>read("$.expense.id").longValue();
        Reply rejectedUpdate = doPut(user, "/api/expenses/" + id, expenseBody("10.00", "Once", null, comida, eleven));
        assertValidationError(rejectedUpdate, "tags");
        assertThat(doGet(user, "/api/expenses").<Integer>read("$.totalElements")).isEqualTo(1);
    }

    @Test
    void tagLongerThan30CharactersAnswers400() throws Exception {
        doPost(user, "/api/expenses", expenseBody("10.00", "Treinta", TODAY, comida, List.of("a".repeat(30))))
                .expect(201);

        Reply rejected = doPost(user, "/api/expenses",
                expenseBody("10.00", "Treinta y uno", TODAY, comida, List.of("a".repeat(31))));

        rejected.expect(400);
        List<String> fields = rejected.read("$.fieldErrors[*].field");
        assertThat(fields).isNotEmpty().allSatisfy(field -> assertThat(field).startsWith("tags"));
    }

    @Test
    void blankTagAnswers400() throws Exception {
        Reply rejected = doPost(user, "/api/expenses",
                expenseBody("10.00", "Etiqueta vacía", TODAY, comida, List.of("   ")));

        rejected.expect(400);
        List<String> fields = rejected.read("$.fieldErrors[*].field");
        assertThat(fields).isNotEmpty().allSatisfy(field -> assertThat(field).startsWith("tags"));
    }

    // ---------- Categories in expenses ----------

    @Test
    void renamingACategoryShowsTheNewNameInExistingExpenses() throws Exception {
        long id = createExpenseId(user, "10.00", "Almuerzo", TODAY, comida);
        Map<String, Object> rename = new LinkedHashMap<>();
        rename.put("name", "Alimentos");
        rename.put("color", "#ABCDEF");

        doPut(user, "/api/categories/" + comida, rename).expect(200);

        Reply stored = doGet(user, "/api/expenses/" + id).expect(200);
        assertThat(stored.<String>read("$.category.name")).isEqualTo("Alimentos");
        assertThat(stored.<String>read("$.category.color")).isEqualTo("#ABCDEF");
        assertThat(doGet(user, "/api/expenses").<String>read("$.content[0].category.name")).isEqualTo("Alimentos");
        assertThat(summary(user, "DAY").<String>read("$.byCategory[0].name")).isEqualTo("Alimentos");
    }
}
