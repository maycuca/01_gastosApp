package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Spec sections 2 (ExpenseLimit), 3 (Límites), 4 (Límites excedidos) and 6 (Límites). */
class LimitApiTest extends ApiTestSupport {

    private static final List<String> PERIODS = List.of("DAY", "WEEK", "FORTNIGHT", "MONTH", "YEAR");

    private Session user;
    private long comida;

    @BeforeEach
    void setUpUser() throws Exception {
        user = register();
        comida = categoryId(user, "Comida");
    }

    private List<String> exceededPeriods(Reply saved) {
        return saved.read("$.exceededLimits[*].period");
    }

    // ---------- CRUD ----------

    @Test
    void newUserHasNoLimits() throws Exception {
        assertThat(doGet(user, "/api/limits").expect(200).<List<Object>>read("$")).isEmpty();
    }

    @Test
    void fixesALimitAndReturnsItsCurrentState() throws Exception {
        createExpense(user, "4850.50", "Renta", TODAY, comida);

        Reply reply = putLimit(user, "MONTH", "5000.00");

        reply.expect(200);
        Map<String, Object> body = reply.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("period", "limitAmount", "spent", "remaining",
                "exceeded");
        assertThat(body).containsEntry("period", "MONTH").containsEntry("exceeded", false);
        assertThat(reply.decimal("$.limitAmount")).isEqualByComparingTo("5000.00");
        assertThat(reply.decimal("$.spent")).isEqualByComparingTo("4850.50");
        assertThat(reply.decimal("$.remaining")).isEqualByComparingTo("149.50");
        assertThat(reply.body()).contains("\"limitAmount\":5000.00").contains("\"spent\":4850.50")
                .contains("\"remaining\":149.50");

        Reply list = doGet(user, "/api/limits").expect(200);
        assertThat(list.<List<Map<String, Object>>>read("$")).hasSize(1);
        Map<String, Object> listed = list.read("$[0]");
        assertThat(listed.keySet()).containsExactlyInAnyOrder("period", "limitAmount", "spent", "remaining",
                "exceeded");
        assertThat(listed).containsEntry("period", "MONTH").containsEntry("exceeded", false);
        assertThat(list.decimal("$[0].remaining")).isEqualByComparingTo("149.50");
    }

    @Test
    void aLimitCanBeFixedForEveryPeriod() throws Exception {
        for (String period : PERIODS) {
            Reply reply = putLimit(user, period, "100.00").expect(200);
            assertThat(reply.<String>read("$.period")).isEqualTo(period);
        }

        List<String> listed = doGet(user, "/api/limits").expect(200).read("$[*].period");
        assertThat(listed).containsExactlyInAnyOrderElementsOf(PERIODS);
    }

    @Test
    void puttingAgainReplacesTheLimit() throws Exception {
        putLimit(user, "WEEK", "100.00").expect(200);

        Reply reply = putLimit(user, "WEEK", "250.75");

        reply.expect(200);
        assertThat(reply.decimal("$.limitAmount")).isEqualByComparingTo("250.75");
        Reply list = doGet(user, "/api/limits").expect(200);
        assertThat(list.<List<Object>>read("$")).hasSize(1);
        assertThat(list.decimal("$[0].limitAmount")).isEqualByComparingTo("250.75");
        assertThat(jdbc.queryForObject("select count(*) from expense_limits where user_id = ?", Integer.class,
                user.userId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select limit_cents from expense_limits where user_id = ?", Long.class,
                user.userId())).isEqualTo(25075L);
    }

    @Test
    void removesALimit() throws Exception {
        putLimit(user, "MONTH", "100.00").expect(200);
        putLimit(user, "DAY", "10.00").expect(200);

        Reply reply = doDelete(user, "/api/limits/MONTH");

        reply.expect(204);
        assertThat(reply.body()).isEmpty();
        assertThat(doGet(user, "/api/limits").expect(200).<List<String>>read("$[*].period")).containsExactly("DAY");
        assertThat(summary(user, "MONTH").<Object>read("$.limit")).isNull();
    }

    @Test
    void removingALimitThatDoesNotExistAnswers404() throws Exception {
        assertPlainError(doDelete(user, "/api/limits/YEAR"), 404, "Not Found");
    }

    @ParameterizedTest
    @ValueSource(strings = { "0", "-1", "-0.01", "10.999" })
    void limitAmountMustBePositiveWithTwoDecimals(String amount) throws Exception {
        assertValidationError(putLimit(user, "MONTH", amount), "limitAmount");

        assertThat(doGet(user, "/api/limits").<List<Object>>read("$")).isEmpty();
    }

    @Test
    void limitAmountIsRequired() throws Exception {
        assertValidationError(doPut(user, "/api/limits/MONTH", "{}"), "limitAmount");
    }

    @Test
    void unknownPeriodAnswers400() throws Exception {
        putLimit(user, "DECADE", "100.00").expect(400);
        doDelete(user, "/api/limits/DECADE").expect(400);
    }

    @Test
    void remainingCanBeNegative() throws Exception {
        createExpense(user, "130.00", "Mucho", TODAY, comida);

        Reply reply = putLimit(user, "DAY", "100.00").expect(200);

        assertThat(reply.decimal("$.remaining")).isEqualByComparingTo("-30.00");
        assertThat(reply.<Boolean>read("$.exceeded")).isTrue();
        assertThat(reply.decimal("$.spent")).isEqualByComparingTo("130.00");
    }

    @Test
    void listShowsTheStateOfThePeriodInCourse() throws Exception {
        // TODAY is Wednesday 2026-11-18.
        createExpense(user, "1.00", "Hoy", TODAY, comida);
        createExpense(user, "2.00", "Lunes de esta semana", LocalDate.of(2026, 11, 16), comida);
        createExpense(user, "4.00", "Domingo pasado (quincena anterior)", LocalDate.of(2026, 11, 15), comida);
        createExpense(user, "8.00", "Día 1 del mes", LocalDate.of(2026, 11, 1), comida);
        createExpense(user, "16.00", "Mes pasado", LocalDate.of(2026, 10, 31), comida);
        createExpense(user, "32.00", "1 de enero", LocalDate.of(2026, 1, 1), comida);
        createExpense(user, "64.00", "Año pasado", LocalDate.of(2025, 12, 31), comida);
        for (String period : PERIODS) {
            putLimit(user, period, "1000.00").expect(200);
        }

        Reply list = doGet(user, "/api/limits").expect(200);

        assertSpent(list, "DAY", "1.00");
        assertSpent(list, "WEEK", "3.00");
        assertSpent(list, "FORTNIGHT", "3.00");
        assertSpent(list, "MONTH", "15.00");
        assertSpent(list, "YEAR", "63.00");
    }

    private static void assertSpent(Reply list, String period, String expected) {
        List<Number> spent = list.read("$[?(@.period == '" + period + "')].spent");
        assertThat(spent).as(period).hasSize(1);
        assertThat(money(String.valueOf(spent.get(0)))).as(period).isEqualByComparingTo(expected);
        List<Number> remaining = list.read("$[?(@.period == '" + period + "')].remaining");
        assertThat(money(String.valueOf(remaining.get(0)))).as(period + " remaining")
                .isEqualByComparingTo(money("1000.00").subtract(money(expected)));
    }

    // ---------- exceededLimits ----------

    @Test
    void creatingAnExpenseReportsALimitOnlyWhenSpentIsStrictlyGreater() throws Exception {
        putLimit(user, "MONTH", "100.00").expect(200);

        Reply below = createExpense(user, "60.00", "Debajo", TODAY, comida);
        Reply exactly = createExpense(user, "40.00", "Justo en el límite", TODAY, comida);
        Reply above = createExpense(user, "0.01", "Un centavo de más", TODAY, comida);

        assertThat(below.<List<Object>>read("$.exceededLimits")).isEmpty();
        assertThat(exactly.<List<Object>>read("$.exceededLimits")).isEmpty();
        assertThat(above.<List<Object>>read("$.exceededLimits")).hasSize(1);
        Map<String, Object> exceeded = above.read("$.exceededLimits[0]");
        assertThat(exceeded.keySet()).containsExactlyInAnyOrder("period", "limitAmount", "spent");
        assertThat(exceeded).containsEntry("period", "MONTH");
        assertThat(above.decimal("$.exceededLimits[0].limitAmount")).isEqualByComparingTo("100.00");
        assertThat(above.decimal("$.exceededLimits[0].spent")).isEqualByComparingTo("100.01");
        assertThat(above.body()).contains("\"limitAmount\":100.00").contains("\"spent\":100.01");
    }

    @Test
    void anExceededLimitNeverPreventsSavingTheExpense() throws Exception {
        putLimit(user, "DAY", "10.00").expect(200);

        Reply saved = createExpense(user, "500.00", "Muy por encima", TODAY, comida);

        assertThat(exceededPeriods(saved)).containsExactly("DAY");
        long id = saved.<Number>read("$.expense.id").longValue();
        assertThat(doGet(user, "/api/expenses/" + id).expect(200).decimal("$.amount"))
                .isEqualByComparingTo("500.00");
        assertThat(doGet(user, "/api/expenses").<Integer>read("$.totalElements")).isEqualTo(1);
        Reply limits = doGet(user, "/api/limits").expect(200);
        assertThat(limits.<Boolean>read("$[0].exceeded")).isTrue();
        assertThat(limits.decimal("$[0].remaining")).isEqualByComparingTo("-490.00");
    }

    @Test
    void editingAnExpenseReportsExceededLimitsAndStopsWhenItGoesBelow() throws Exception {
        putLimit(user, "MONTH", "100.00").expect(200);
        createExpense(user, "60.00", "Fijo", TODAY, comida);
        long id = createExpenseId(user, "30.00", "Variable", TODAY, comida);

        Reply raised = doPut(user, "/api/expenses/" + id, expenseBody("50.00", "Variable", null, comida, null))
                .expect(200);
        assertThat(exceededPeriods(raised)).containsExactly("MONTH");
        assertThat(raised.decimal("$.exceededLimits[0].spent")).isEqualByComparingTo("110.00");
        assertThat(raised.decimal("$.exceededLimits[0].limitAmount")).isEqualByComparingTo("100.00");
        assertThat(doGet(user, "/api/expenses/" + id).decimal("$.amount")).isEqualByComparingTo("50.00");
        assertThat(doGet(user, "/api/limits").<Boolean>read("$[0].exceeded")).isTrue();
        assertThat(summary(user, "MONTH").<Boolean>read("$.limit.exceeded")).isTrue();

        Reply atLimit = doPut(user, "/api/expenses/" + id, expenseBody("40.00", "Variable", null, comida, null))
                .expect(200);
        assertThat(atLimit.<List<Object>>read("$.exceededLimits")).isEmpty();
        assertThat(doGet(user, "/api/limits").<Boolean>read("$[0].exceeded")).isFalse();
        assertThat(summary(user, "MONTH").<Boolean>read("$.limit.exceeded")).isFalse();

        Reply lowered = doPut(user, "/api/expenses/" + id, expenseBody("10.00", "Variable", null, comida, null))
                .expect(200);
        assertThat(lowered.<List<Object>>read("$.exceededLimits")).isEmpty();
    }

    @Test
    void deletingAnExpenseBringsTheLimitBackBelow() throws Exception {
        putLimit(user, "WEEK", "100.00").expect(200);
        createExpense(user, "60.00", "Fijo", TODAY, comida);
        Reply over = createExpense(user, "70.00", "De más", TODAY, comida);
        assertThat(exceededPeriods(over)).containsExactly("WEEK");
        assertThat(summary(user, "WEEK").<Boolean>read("$.limit.exceeded")).isTrue();

        doDelete(user, "/api/expenses/" + over.<Number>read("$.expense.id")).expect(204);

        Reply limits = doGet(user, "/api/limits").expect(200);
        assertThat(limits.<Boolean>read("$[0].exceeded")).isFalse();
        assertThat(limits.decimal("$[0].spent")).isEqualByComparingTo("60.00");
        assertThat(limits.decimal("$[0].remaining")).isEqualByComparingTo("40.00");
        Reply week = summary(user, "WEEK");
        assertThat(week.<Boolean>read("$.limit.exceeded")).isFalse();
        assertThat(week.decimal("$.limit.remaining")).isEqualByComparingTo("40.00");
        Reply next = createExpense(user, "1.00", "Otro", TODAY, comida);
        assertThat(next.<List<Object>>read("$.exceededLimits")).isEmpty();
    }

    @Test
    void raisingOrRemovingTheLimitStopsReportingIt() throws Exception {
        putLimit(user, "MONTH", "100.00").expect(200);
        assertThat(exceededPeriods(createExpense(user, "150.00", "Uno", TODAY, comida))).containsExactly("MONTH");

        putLimit(user, "MONTH", "500.00").expect(200);
        assertThat(exceededPeriods(createExpense(user, "1.00", "Dos", TODAY, comida))).isEmpty();

        putLimit(user, "MONTH", "100.00").expect(200);
        assertThat(exceededPeriods(createExpense(user, "1.00", "Tres", TODAY, comida))).containsExactly("MONTH");

        doDelete(user, "/api/limits/MONTH").expect(204);
        assertThat(exceededPeriods(createExpense(user, "1.00", "Cuatro", TODAY, comida))).isEmpty();
    }

    @Test
    void onlyTheExceededLimitsAreReported() throws Exception {
        putLimit(user, "DAY", "10.00").expect(200);
        putLimit(user, "WEEK", "1000.00").expect(200);
        putLimit(user, "YEAR", "20.00").expect(200);

        Reply first = createExpense(user, "15.00", "Primero", TODAY, comida);
        Reply second = createExpense(user, "10.00", "Segundo", TODAY, comida);

        assertThat(exceededPeriods(first)).containsExactly("DAY");
        assertThat(exceededPeriods(second)).containsExactlyInAnyOrder("DAY", "YEAR");
        List<Number> yearSpent = second.read("$.exceededLimits[?(@.period == 'YEAR')].spent");
        assertThat(money(String.valueOf(yearSpent.get(0)))).isEqualByComparingTo("25.00");
    }

    @Test
    void limitsAreEvaluatedOnThePeriodsThatContainTheExpenseDate() throws Exception {
        putLimit(user, "MONTH", "100.00").expect(200);

        // An October expense exceeds October, although November (the month in course) is empty.
        Reply october = createExpense(user, "150.00", "Octubre", LocalDate.of(2026, 10, 10), comida);
        assertThat(exceededPeriods(october)).containsExactly("MONTH");
        assertThat(october.decimal("$.exceededLimits[0].spent")).isEqualByComparingTo("150.00");
        Reply current = doGet(user, "/api/limits").expect(200);
        assertThat(current.decimal("$[0].spent")).isEqualByComparingTo("0.00");
        assertThat(current.<Boolean>read("$[0].exceeded")).isFalse();

        // A November expense is evaluated against November only.
        Reply november = createExpense(user, "10.00", "Noviembre", TODAY, comida);
        assertThat(exceededPeriods(november)).isEmpty();

        // Editing the October expense evaluates October again.
        long id = october.<Number>read("$.expense.id").longValue();
        Reply edited = doPut(user, "/api/expenses/" + id, expenseBody("120.00", "Octubre", null, comida, null))
                .expect(200);
        assertThat(exceededPeriods(edited)).containsExactly("MONTH");
        assertThat(edited.decimal("$.exceededLimits[0].spent")).isEqualByComparingTo("120.00");
        Reply editedBelow = doPut(user, "/api/expenses/" + id, expenseBody("100.00", "Octubre", null, comida, null))
                .expect(200);
        assertThat(exceededPeriods(editedBelow)).isEmpty();
    }

    @Test
    void fortnightLimitUsesTheFortnightOfTheExpenseDate() throws Exception {
        putLimit(user, "FORTNIGHT", "50.00").expect(200);

        Reply firstHalf = createExpense(user, "40.00", "Día 15", LocalDate.of(2026, 11, 15), comida);
        Reply secondHalf = createExpense(user, "40.00", "Día 16", LocalDate.of(2026, 11, 16), comida);
        Reply secondHalfAgain = createExpense(user, "20.00", "Día 18", TODAY, comida);
        Reply firstHalfAgain = createExpense(user, "10.01", "Día 1", LocalDate.of(2026, 11, 1), comida);

        assertThat(exceededPeriods(firstHalf)).isEmpty();
        assertThat(exceededPeriods(secondHalf)).isEmpty();
        assertThat(exceededPeriods(secondHalfAgain)).containsExactly("FORTNIGHT");
        assertThat(secondHalfAgain.decimal("$.exceededLimits[0].spent")).isEqualByComparingTo("60.00");
        assertThat(exceededPeriods(firstHalfAgain)).containsExactly("FORTNIGHT");
        assertThat(firstHalfAgain.decimal("$.exceededLimits[0].spent")).isEqualByComparingTo("50.01");
    }

    @Test
    void weekLimitUsesMondayToSundayAcrossMonths() throws Exception {
        clock.setDate(LocalDate.of(2026, 12, 2)); // Wednesday; its week is Mon 11-30 .. Sun 12-06
        putLimit(user, "WEEK", "50.00").expect(200);

        Reply sundayBefore = createExpense(user, "45.00", "Domingo anterior", LocalDate.of(2026, 11, 29), comida);
        Reply monday = createExpense(user, "30.00", "Lunes 30 de noviembre", LocalDate.of(2026, 11, 30), comida);
        Reply wednesday = createExpense(user, "30.00", "Miércoles 2 de diciembre", LocalDate.of(2026, 12, 2),
                comida);

        assertThat(exceededPeriods(sundayBefore)).isEmpty();
        assertThat(exceededPeriods(monday)).isEmpty();
        assertThat(exceededPeriods(wednesday)).containsExactly("WEEK");
        assertThat(wednesday.decimal("$.exceededLimits[0].spent")).isEqualByComparingTo("60.00");
        assertThat(doGet(user, "/api/limits").decimal("$[0].spent")).isEqualByComparingTo("60.00");
    }

    @Test
    void yearLimitDoesNotMixYears() throws Exception {
        putLimit(user, "YEAR", "100.00").expect(200);

        Reply lastYear = createExpense(user, "90.00", "31 de diciembre", LocalDate.of(2025, 12, 31), comida);
        Reply thisYear = createExpense(user, "90.00", "1 de enero", LocalDate.of(2026, 1, 1), comida);
        Reply thisYearAgain = createExpense(user, "10.01", "Hoy", TODAY, comida);

        assertThat(exceededPeriods(lastYear)).isEmpty();
        assertThat(exceededPeriods(thisYear)).isEmpty();
        assertThat(exceededPeriods(thisYearAgain)).containsExactly("YEAR");
        assertThat(thisYearAgain.decimal("$.exceededLimits[0].spent")).isEqualByComparingTo("100.01");
    }
}
