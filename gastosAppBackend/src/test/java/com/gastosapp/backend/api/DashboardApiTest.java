package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Spec sections 1 (Períodos), 3 (Dashboard) and 6 (Dashboard). "Today" is fixed with the injectable clock. */
class DashboardApiTest extends ApiTestSupport {

    private Session user;
    private long comida;
    private long transporte;
    private long salud;

    @BeforeEach
    void setUpUser() throws Exception {
        user = register();
        comida = categoryId(user, "Comida");
        transporte = categoryId(user, "Transporte");
        salud = categoryId(user, "Salud");
    }

    /** Expenses around Wednesday 2026-11-18, placed on the edges of every current and previous period. */
    private void seedAroundToday() throws Exception {
        createExpense(user, "1000.00", "Hace dos años", LocalDate.of(2024, 12, 31), comida);
        createExpense(user, "10.00", "Primer día del año pasado", LocalDate.of(2025, 1, 1), comida);
        createExpense(user, "40.00", "Último día del año pasado", LocalDate.of(2025, 12, 31), comida);
        createExpense(user, "999.00", "Septiembre", LocalDate.of(2026, 9, 30), comida);
        createExpense(user, "100.00", "Primer día del mes pasado", LocalDate.of(2026, 10, 1), comida);
        createExpense(user, "50.00", "Último día del mes pasado", LocalDate.of(2026, 10, 31), comida);
        createExpense(user, "30.00", "Día 1", LocalDate.of(2026, 11, 1), comida);
        createExpense(user, "20.00", "Lunes de la semana pasada", LocalDate.of(2026, 11, 9), transporte);
        createExpense(user, "5.00", "Domingo de la semana pasada", LocalDate.of(2026, 11, 15), salud);
        createExpense(user, "7.00", "Ayer", LocalDate.of(2026, 11, 17), transporte);
        createExpense(user, "60.00", "Hoy", LocalDate.of(2026, 11, 18), comida);
    }

    private static List<String> labels(Reply summary) {
        return summary.read("$.breakdown[*].label");
    }

    private static BigDecimal breakdownAmount(Reply summary, String label) {
        List<Number> amounts = summary.read("$.breakdown[?(@.label == '" + label + "')].amount");
        assertThat(amounts).as("breakdown point %s", label).hasSize(1);
        return new BigDecimal(String.valueOf(amounts.get(0)));
    }

    private static List<String> datesBetween(LocalDate from, LocalDate to) {
        List<String> dates = new ArrayList<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            dates.add(date.toString());
        }
        return dates;
    }

    // ---------- Shape ----------

    @Test
    void summaryHasTheSpecShape() throws Exception {
        seedAroundToday();
        putLimit(user, "MONTH", "5000.00").expect(200);

        Reply reply = summary(user, "MONTH");

        Map<String, Object> body = reply.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("period", "from", "to", "totalSpent", "previousTotal",
                "changePercentage", "limit", "byCategory", "breakdown");
        Map<String, Object> limit = reply.read("$.limit");
        assertThat(limit.keySet()).containsExactlyInAnyOrder("limitAmount", "remaining", "percentageUsed",
                "exceeded");
        Map<String, Object> category = reply.read("$.byCategory[0]");
        assertThat(category.keySet()).containsExactlyInAnyOrder("categoryId", "name", "color", "amount",
                "percentage");
        Map<String, Object> point = reply.read("$.breakdown[0]");
        assertThat(point.keySet()).containsExactlyInAnyOrder("label", "amount");
        assertThat(reply.body()).contains("\"totalSpent\":122.00").contains("\"previousTotal\":150.00");
    }

    @Test
    void emptyUserGetsZerosAndNulls() throws Exception {
        for (String period : List.of("DAY", "WEEK", "FORTNIGHT", "MONTH", "YEAR")) {
            Reply reply = summary(user, period);

            Map<String, Object> body = reply.read("$");
            assertThat(body.keySet()).as(period).containsExactlyInAnyOrder("period", "from", "to", "totalSpent",
                    "previousTotal", "changePercentage", "limit", "byCategory", "breakdown");
            assertThat(body).containsEntry("period", period);
            assertThat(reply.decimal("$.totalSpent")).isEqualByComparingTo("0");
            assertThat(reply.decimal("$.previousTotal")).isEqualByComparingTo("0");
            assertThat(body.get("changePercentage")).as("changePercentage").isNull();
            assertThat(body.get("limit")).as("limit").isNull();
            assertThat(reply.<List<Object>>read("$.byCategory")).isEmpty();
        }
    }

    @Test
    void periodParameterIsRequiredAndValidated() throws Exception {
        doGet(user, "/api/dashboard/summary").expect(400);
        doGet(user, "/api/dashboard/summary?period=DECADE").expect(400);
        doGet(user, "/api/dashboard/summary?period=month").expect(400);
    }

    // ---------- Ranges ----------

    @ParameterizedTest(name = "today {0}, {1}: {2} .. {3}")
    @CsvSource({
            // Wednesday in the second fortnight
            "2026-11-18, DAY,       2026-11-18, 2026-11-18",
            "2026-11-18, WEEK,      2026-11-16, 2026-11-22",
            "2026-11-18, FORTNIGHT, 2026-11-16, 2026-11-30",
            "2026-11-18, MONTH,     2026-11-01, 2026-11-30",
            "2026-11-18, YEAR,      2026-01-01, 2026-12-31",
            // Sunday the 15th: last day of its week and of the first fortnight
            "2026-11-15, WEEK,      2026-11-09, 2026-11-15",
            "2026-11-15, FORTNIGHT, 2026-11-01, 2026-11-15",
            // Monday the 16th: first day of its week and of the second fortnight
            "2026-11-16, WEEK,      2026-11-16, 2026-11-22",
            "2026-11-16, FORTNIGHT, 2026-11-16, 2026-11-30",
            // First day of a month
            "2026-11-01, FORTNIGHT, 2026-11-01, 2026-11-15",
            "2026-11-01, WEEK,      2026-10-26, 2026-11-01",
            "2026-11-01, MONTH,     2026-11-01, 2026-11-30",
            // End of month and of year (Thursday): the week runs into the next year
            "2026-12-31, DAY,       2026-12-31, 2026-12-31",
            "2026-12-31, WEEK,      2026-12-28, 2027-01-03",
            "2026-12-31, FORTNIGHT, 2026-12-16, 2026-12-31",
            "2026-12-31, MONTH,     2026-12-01, 2026-12-31",
            "2026-12-31, YEAR,      2026-01-01, 2026-12-31",
            // New Year's Day (Friday): the week started in the previous year
            "2027-01-01, WEEK,      2026-12-28, 2027-01-03",
            "2027-01-01, FORTNIGHT, 2027-01-01, 2027-01-15",
            "2027-01-01, MONTH,     2027-01-01, 2027-01-31",
            "2027-01-01, YEAR,      2027-01-01, 2027-12-31",
            // February, non-leap year
            "2027-02-20, FORTNIGHT, 2027-02-16, 2027-02-28",
            "2027-02-20, MONTH,     2027-02-01, 2027-02-28",
            "2027-02-28, FORTNIGHT, 2027-02-16, 2027-02-28",
            "2027-02-28, WEEK,      2027-02-22, 2027-02-28",
            // February, leap year
            "2028-02-29, DAY,       2028-02-29, 2028-02-29",
            "2028-02-29, WEEK,      2028-02-28, 2028-03-05",
            "2028-02-29, FORTNIGHT, 2028-02-16, 2028-02-29",
            "2028-02-29, MONTH,     2028-02-01, 2028-02-29",
            "2028-02-29, YEAR,      2028-01-01, 2028-12-31",
            // 30-day month
            "2027-04-30, FORTNIGHT, 2027-04-16, 2027-04-30",
            "2027-04-15, FORTNIGHT, 2027-04-01, 2027-04-15",
    })
    void summaryCoversTheCalendarPeriodInCourse(LocalDate today, String period, String from, String to)
            throws Exception {
        clock.setDate(today);

        Reply reply = summary(user, period);

        assertThat(reply.<String>read("$.period")).isEqualTo(period);
        assertThat(reply.<String>read("$.from")).isEqualTo(from);
        assertThat(reply.<String>read("$.to")).isEqualTo(to);
    }

    // ---------- Totals and comparison ----------

    @ParameterizedTest(name = "{0}: total {1}, previous {2}, change {3}")
    @CsvSource({
            "DAY,       60.00,   7.00,   757.14",
            "WEEK,      67.00,   25.00,  168.00",
            "FORTNIGHT, 67.00,   55.00,  21.82",
            "MONTH,     122.00,  150.00, -18.67",
            "YEAR,      1271.00, 50.00,  2442.00",
    })
    void totalsUseTheWholeCurrentAndPreviousPeriods(String period, String total, String previous, String change)
            throws Exception {
        seedAroundToday();

        Reply reply = summary(user, period);

        assertThat(reply.decimal("$.totalSpent")).as("totalSpent").isEqualByComparingTo(total);
        assertThat(reply.decimal("$.previousTotal")).as("previousTotal").isEqualByComparingTo(previous);
        assertThat(reply.decimal("$.changePercentage")).as("changePercentage").isEqualByComparingTo(change);
    }

    @Test
    void changePercentageMatchesTheSpecExample() throws Exception {
        createExpense(user, "3200.00", "Mes pasado", LocalDate.of(2026, 10, 15), comida);
        createExpense(user, "4850.50", "Este mes", TODAY, comida);
        putLimit(user, "MONTH", "5000.00").expect(200);

        Reply reply = summary(user, "MONTH");

        assertThat(reply.decimal("$.totalSpent")).isEqualByComparingTo("4850.50");
        assertThat(reply.decimal("$.previousTotal")).isEqualByComparingTo("3200.00");
        assertThat(reply.decimal("$.changePercentage")).isEqualByComparingTo("51.58");
        assertThat(reply.decimal("$.limit.limitAmount")).isEqualByComparingTo("5000.00");
        assertThat(reply.decimal("$.limit.remaining")).isEqualByComparingTo("149.50");
        assertThat(reply.decimal("$.limit.percentageUsed")).isEqualByComparingTo("97.01");
        assertThat(reply.<Boolean>read("$.limit.exceeded")).isFalse();
    }

    @Test
    void changePercentageIsNullWhenThePreviousTotalIsZero() throws Exception {
        createExpense(user, "60.00", "Hoy", TODAY, comida);
        // Two periods back must not count as "previous".
        createExpense(user, "500.00", "Hace dos meses", LocalDate.of(2026, 9, 15), comida);

        Reply month = summary(user, "MONTH");

        Map<String, Object> body = month.read("$");
        assertThat(body).containsKey("changePercentage");
        assertThat(body.get("changePercentage")).isNull();
        assertThat(month.decimal("$.previousTotal")).isEqualByComparingTo("0");
        assertThat(month.decimal("$.totalSpent")).isEqualByComparingTo("60.00");
        assertThat(month.body()).contains("\"changePercentage\":null");
    }

    @Test
    void changePercentageIsMinus100WhenNothingWasSpentInTheCurrentPeriod() throws Exception {
        createExpense(user, "80.00", "Mes pasado", LocalDate.of(2026, 10, 20), comida);

        Reply month = summary(user, "MONTH");

        assertThat(month.decimal("$.totalSpent")).isEqualByComparingTo("0");
        assertThat(month.decimal("$.previousTotal")).isEqualByComparingTo("80.00");
        assertThat(month.decimal("$.changePercentage")).isEqualByComparingTo("-100.00");
    }

    @Test
    void previousFortnightOfTheFirstHalfIsTheSecondHalfOfThePreviousMonth() throws Exception {
        clock.setDate(LocalDate.of(2027, 3, 1)); // Monday; previous fortnight is 2027-02-16 .. 2027-02-28
        createExpense(user, "1.00", "Día 15 de febrero (fuera)", LocalDate.of(2027, 2, 15), comida);
        createExpense(user, "2.00", "Día 16 de febrero", LocalDate.of(2027, 2, 16), comida);
        createExpense(user, "4.00", "Día 28 de febrero", LocalDate.of(2027, 2, 28), comida);
        createExpense(user, "8.00", "Día 1 de marzo", LocalDate.of(2027, 3, 1), comida);

        Reply fortnight = summary(user, "FORTNIGHT");
        Reply month = summary(user, "MONTH");
        Reply week = summary(user, "WEEK");
        Reply day = summary(user, "DAY");

        assertThat(fortnight.<String>read("$.from")).isEqualTo("2027-03-01");
        assertThat(fortnight.<String>read("$.to")).isEqualTo("2027-03-15");
        assertThat(fortnight.decimal("$.totalSpent")).isEqualByComparingTo("8.00");
        assertThat(fortnight.decimal("$.previousTotal")).isEqualByComparingTo("6.00");
        assertThat(month.decimal("$.previousTotal")).isEqualByComparingTo("7.00");
        // Previous week is Mon 02-22 .. Sun 02-28.
        assertThat(week.decimal("$.previousTotal")).isEqualByComparingTo("4.00");
        assertThat(day.decimal("$.previousTotal")).isEqualByComparingTo("4.00");
    }

    @Test
    void previousPeriodsAcrossTheChangeOfYear() throws Exception {
        clock.setDate(LocalDate.of(2027, 1, 1)); // Friday; week is Mon 2026-12-28 .. Sun 2027-01-03
        createExpense(user, "1.00", "15 de diciembre", LocalDate.of(2026, 12, 15), comida);
        createExpense(user, "2.00", "16 de diciembre", LocalDate.of(2026, 12, 16), comida);
        createExpense(user, "4.00", "Lunes 21 de diciembre", LocalDate.of(2026, 12, 21), comida);
        createExpense(user, "8.00", "Domingo 27 de diciembre", LocalDate.of(2026, 12, 27), comida);
        createExpense(user, "16.00", "Lunes 28 de diciembre", LocalDate.of(2026, 12, 28), comida);
        createExpense(user, "32.00", "31 de diciembre", LocalDate.of(2026, 12, 31), comida);
        createExpense(user, "64.00", "1 de enero", LocalDate.of(2027, 1, 1), comida);
        createExpense(user, "128.00", "1 de enero del año anterior", LocalDate.of(2026, 1, 1), comida);
        createExpense(user, "256.00", "31 de diciembre de 2025", LocalDate.of(2025, 12, 31), comida);

        Reply day = summary(user, "DAY");
        Reply week = summary(user, "WEEK");
        Reply fortnight = summary(user, "FORTNIGHT");
        Reply month = summary(user, "MONTH");
        Reply year = summary(user, "YEAR");

        assertThat(day.decimal("$.totalSpent")).isEqualByComparingTo("64.00");
        assertThat(day.decimal("$.previousTotal")).isEqualByComparingTo("32.00");
        // Current week: 12-28, 12-31 and 01-01. Previous week: 12-21 .. 12-27.
        assertThat(week.decimal("$.totalSpent")).isEqualByComparingTo("112.00");
        assertThat(week.decimal("$.previousTotal")).isEqualByComparingTo("12.00");
        // Previous fortnight: 12-16 .. 12-31.
        assertThat(fortnight.decimal("$.totalSpent")).isEqualByComparingTo("64.00");
        assertThat(fortnight.decimal("$.previousTotal")).isEqualByComparingTo("62.00");
        // Previous month: December 2026.
        assertThat(month.decimal("$.totalSpent")).isEqualByComparingTo("64.00");
        assertThat(month.decimal("$.previousTotal")).isEqualByComparingTo("63.00");
        // Previous year: 2026 only.
        assertThat(year.decimal("$.totalSpent")).isEqualByComparingTo("64.00");
        assertThat(year.decimal("$.previousTotal")).isEqualByComparingTo("191.00");
        assertThat(labels(week)).containsExactlyElementsOf(
                datesBetween(LocalDate.of(2026, 12, 28), LocalDate.of(2027, 1, 3)));
    }

    @Test
    void previousMonthOfMarchIsTheWholeLeapFebruary() throws Exception {
        clock.setDate(LocalDate.of(2028, 3, 10));
        createExpense(user, "1.00", "31 de enero (fuera)", LocalDate.of(2028, 1, 31), comida);
        createExpense(user, "2.00", "1 de febrero", LocalDate.of(2028, 2, 1), comida);
        createExpense(user, "4.00", "29 de febrero", LocalDate.of(2028, 2, 29), comida);

        Reply month = summary(user, "MONTH");
        Reply fortnight = summary(user, "FORTNIGHT");

        assertThat(month.decimal("$.previousTotal")).isEqualByComparingTo("6.00");
        // Previous fortnight of 03-01..03-15 is 02-16..02-29.
        assertThat(fortnight.decimal("$.previousTotal")).isEqualByComparingTo("4.00");
    }

    // ---------- Limit ----------

    @Test
    void limitIsNullWhenThereIsNoLimitForThatPeriod() throws Exception {
        seedAroundToday();
        putLimit(user, "WEEK", "100.00").expect(200);

        Reply month = summary(user, "MONTH");
        Reply week = summary(user, "WEEK");

        Map<String, Object> body = month.read("$");
        assertThat(body).containsKey("limit");
        assertThat(body.get("limit")).isNull();
        assertThat(month.body()).contains("\"limit\":null");
        assertThat(week.<Object>read("$.limit")).isNotNull();
    }

    @Test
    void limitReportsRemainingPercentageAndExceeded() throws Exception {
        seedAroundToday(); // MONTH total is 122.00
        putLimit(user, "MONTH", "100.00").expect(200);

        Reply exceeded = summary(user, "MONTH");

        assertThat(exceeded.decimal("$.limit.limitAmount")).isEqualByComparingTo("100.00");
        assertThat(exceeded.decimal("$.limit.remaining")).isEqualByComparingTo("-22.00");
        assertThat(exceeded.decimal("$.limit.percentageUsed")).isEqualByComparingTo("122.00");
        assertThat(exceeded.<Boolean>read("$.limit.exceeded")).isTrue();

        putLimit(user, "MONTH", "122.00").expect(200);
        Reply atLimit = summary(user, "MONTH");
        assertThat(atLimit.decimal("$.limit.remaining")).isEqualByComparingTo("0.00");
        assertThat(atLimit.decimal("$.limit.percentageUsed")).isEqualByComparingTo("100.00");
        assertThat(atLimit.<Boolean>read("$.limit.exceeded")).as("gastado == límite no es excedido").isFalse();

        putLimit(user, "MONTH", "121.99").expect(200);
        assertThat(summary(user, "MONTH").<Boolean>read("$.limit.exceeded")).isTrue();

        putLimit(user, "MONTH", "300.00").expect(200);
        Reply below = summary(user, "MONTH");
        assertThat(below.decimal("$.limit.remaining")).isEqualByComparingTo("178.00");
        assertThat(below.decimal("$.limit.percentageUsed")).isEqualByComparingTo("40.67");
        assertThat(below.<Boolean>read("$.limit.exceeded")).isFalse();
    }

    // ---------- byCategory ----------

    @Test
    void byCategoryIsOrderedFromHighestToLowestWithPercentages() throws Exception {
        seedAroundToday();

        Reply month = summary(user, "MONTH");

        // November: Comida 30 + 60, Transporte 20 + 7, Salud 5. Total 122.
        assertThat(month.<List<String>>read("$.byCategory[*].name")).containsExactly("Comida", "Transporte",
                "Salud");
        assertThat(month.<List<Number>>read("$.byCategory[*].categoryId").stream().map(Number::longValue))
                .containsExactly(comida, transporte, salud);
        assertThat(month.decimal("$.byCategory[0].amount")).isEqualByComparingTo("90.00");
        assertThat(month.decimal("$.byCategory[1].amount")).isEqualByComparingTo("27.00");
        assertThat(month.decimal("$.byCategory[2].amount")).isEqualByComparingTo("5.00");
        assertThat(month.decimal("$.byCategory[0].percentage")).isEqualByComparingTo("73.77");
        assertThat(month.decimal("$.byCategory[1].percentage")).isEqualByComparingTo("22.13");
        assertThat(month.decimal("$.byCategory[2].percentage")).isEqualByComparingTo("4.10");
        assertThat(month.<String>read("$.byCategory[0].color")).isEqualTo("#FF8A00");
        List<String> colors = month.read("$.byCategory[*].color");
        assertThat(colors).allSatisfy(color -> assertThat(color).matches("^#[0-9A-Fa-f]{6}$"));
    }

    @Test
    void byCategoryOnlyIncludesCategoriesWithSpendingInThePeriod() throws Exception {
        seedAroundToday();

        Reply day = summary(user, "DAY");
        Reply week = summary(user, "WEEK");

        assertThat(day.<List<String>>read("$.byCategory[*].name")).containsExactly("Comida");
        assertThat(day.decimal("$.byCategory[0].percentage")).isEqualByComparingTo("100.00");
        // Week 11-16..11-22: Comida 60, Transporte 7. Salud (11-15) is outside.
        assertThat(week.<List<String>>read("$.byCategory[*].name")).containsExactly("Comida", "Transporte");
        assertThat(week.decimal("$.byCategory[0].percentage")).isEqualByComparingTo("89.55");
        assertThat(week.decimal("$.byCategory[1].percentage")).isEqualByComparingTo("10.45");
    }

    @Test
    void byCategoryUsesTheEditedColorAndName() throws Exception {
        createExpense(user, "10.00", "Almuerzo", TODAY, comida);
        doPut(user, "/api/categories/" + comida, Map.of("name", "Alimentos", "color", "#010203")).expect(200);

        Reply day = summary(user, "DAY");

        assertThat(day.<String>read("$.byCategory[0].name")).isEqualTo("Alimentos");
        assertThat(day.<String>read("$.byCategory[0].color")).isEqualTo("#010203");
    }

    // ---------- breakdown ----------

    @Test
    void breakdownIsEmptyForDay() throws Exception {
        seedAroundToday();

        Reply day = summary(user, "DAY");

        assertThat(day.<List<Object>>read("$.breakdown")).isEmpty();
        assertThat(day.body()).contains("\"breakdown\":[]");
    }

    @Test
    void breakdownOfMonthHasOnePointPerDayWithZeros() throws Exception {
        seedAroundToday();

        Reply month = summary(user, "MONTH");

        assertThat(labels(month)).containsExactlyElementsOf(
                datesBetween(LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 30)));
        assertThat(breakdownAmount(month, "2026-11-01")).isEqualByComparingTo("30.00");
        assertThat(breakdownAmount(month, "2026-11-09")).isEqualByComparingTo("20.00");
        assertThat(breakdownAmount(month, "2026-11-15")).isEqualByComparingTo("5.00");
        assertThat(breakdownAmount(month, "2026-11-17")).isEqualByComparingTo("7.00");
        assertThat(breakdownAmount(month, "2026-11-18")).isEqualByComparingTo("60.00");
        List<Number> amounts = month.read("$.breakdown[*].amount");
        assertThat(amounts.stream().filter(amount -> amount.doubleValue() == 0.0)).hasSize(25);
        // Days after today are part of the period too, with 0.
        assertThat(breakdownAmount(month, "2026-11-30")).isEqualByComparingTo("0");
        assertThat(month.body()).contains("{\"label\":\"2026-11-02\",\"amount\":0.00}");
    }

    @Test
    void breakdownAddsSeveralExpensesOfTheSameDay() throws Exception {
        createExpense(user, "0.10", "Uno", TODAY, comida);
        createExpense(user, "0.20", "Dos", TODAY, transporte);

        Reply week = summary(user, "WEEK");

        assertThat(breakdownAmount(week, "2026-11-18")).isEqualByComparingTo("0.30");
        assertThat(week.body()).contains("{\"label\":\"2026-11-18\",\"amount\":0.30}");
    }

    @Test
    void breakdownOfWeekHasSevenDaysFromMondayToSunday() throws Exception {
        seedAroundToday();

        Reply week = summary(user, "WEEK");

        assertThat(labels(week)).containsExactly("2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19",
                "2026-11-20", "2026-11-21", "2026-11-22");
        assertThat(breakdownAmount(week, "2026-11-16")).isEqualByComparingTo("0");
        assertThat(breakdownAmount(week, "2026-11-17")).isEqualByComparingTo("7.00");
        assertThat(breakdownAmount(week, "2026-11-18")).isEqualByComparingTo("60.00");
    }

    @Test
    void breakdownOfFortnightCoversItsDays() throws Exception {
        seedAroundToday();

        Reply second = summary(user, "FORTNIGHT");
        clock.setDate(LocalDate.of(2026, 11, 15));
        Reply first = summary(user, "FORTNIGHT");

        assertThat(labels(second)).containsExactlyElementsOf(
                datesBetween(LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 30)));
        assertThat(breakdownAmount(second, "2026-11-18")).isEqualByComparingTo("60.00");
        assertThat(labels(first)).containsExactlyElementsOf(
                datesBetween(LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 15)));
        assertThat(breakdownAmount(first, "2026-11-01")).isEqualByComparingTo("30.00");
        assertThat(breakdownAmount(first, "2026-11-15")).isEqualByComparingTo("5.00");
        assertThat(first.decimal("$.totalSpent")).isEqualByComparingTo("55.00");
        // Previous fortnight of 11-01..11-15 is 10-16..10-31.
        assertThat(first.decimal("$.previousTotal")).isEqualByComparingTo("50.00");
    }

    @Test
    void breakdownOfFebruaryFortnightEndsOnTheLastDayOfTheMonth() throws Exception {
        clock.setDate(LocalDate.of(2027, 2, 20));
        assertThat(labels(summary(user, "FORTNIGHT"))).hasSize(13).startsWith("2027-02-16").endsWith("2027-02-28");
        assertThat(labels(summary(user, "MONTH"))).hasSize(28);

        clock.setDate(LocalDate.of(2028, 2, 29));
        assertThat(labels(summary(user, "FORTNIGHT"))).hasSize(14).startsWith("2028-02-16").endsWith("2028-02-29");
        assertThat(labels(summary(user, "MONTH"))).hasSize(29);

        clock.setDate(LocalDate.of(2026, 12, 31));
        assertThat(labels(summary(user, "FORTNIGHT"))).hasSize(16).startsWith("2026-12-16").endsWith("2026-12-31");
        assertThat(labels(summary(user, "MONTH"))).hasSize(31);
    }

    @Test
    void breakdownOfYearHasOnePointPerMonthWithZeros() throws Exception {
        seedAroundToday();

        Reply year = summary(user, "YEAR");

        assertThat(labels(year)).containsExactly("2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
                "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12");
        assertThat(breakdownAmount(year, "2026-09")).isEqualByComparingTo("999.00");
        assertThat(breakdownAmount(year, "2026-10")).isEqualByComparingTo("150.00");
        assertThat(breakdownAmount(year, "2026-11")).isEqualByComparingTo("122.00");
        for (String empty : List.of("2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
                "2026-08", "2026-12")) {
            assertThat(breakdownAmount(year, empty)).as(empty).isEqualByComparingTo("0");
        }
    }

    @Test
    void breakdownTotalsMatchTotalSpent() throws Exception {
        seedAroundToday();

        for (String period : List.of("WEEK", "FORTNIGHT", "MONTH", "YEAR")) {
            Reply reply = summary(user, period);
            List<Number> amounts = reply.read("$.breakdown[*].amount");
            BigDecimal sum = amounts.stream().map(amount -> new BigDecimal(String.valueOf(amount)))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            assertThat(sum).as(period).isEqualByComparingTo(reply.decimal("$.totalSpent"));
            List<Number> byCategory = reply.read("$.byCategory[*].amount");
            BigDecimal categorySum = byCategory.stream().map(amount -> new BigDecimal(String.valueOf(amount)))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            assertThat(categorySum).as(period).isEqualByComparingTo(reply.decimal("$.totalSpent"));
        }
    }
}
