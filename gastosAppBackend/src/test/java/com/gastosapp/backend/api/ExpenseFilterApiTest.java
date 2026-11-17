package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Spec section 3 (filtros de GET /api/expenses) and section 6 (Filtros). */
class ExpenseFilterApiTest extends ApiTestSupport {

    private Session user;
    private long comida;
    private long transporte;
    private long entretenimiento;

    @BeforeEach
    void setUpData() throws Exception {
        user = register();
        comida = categoryId(user, "Comida");
        transporte = categoryId(user, "Transporte");
        entretenimiento = categoryId(user, "Entretenimiento");
        // Created out of date order on purpose, so the order cannot come from insertion order.
        createExpense(user, "30.00", "Almuerzo oficina", TODAY.withDayOfMonth(1), comida, "trabajo");
        createExpense(user, "45.00", "Cine", TODAY.withDayOfMonth(15), entretenimiento, "ocio");
        createExpense(user, "20.00", "Taxi aeropuerto", TODAY.withDayOfMonth(10), transporte, "trabajo", "viaje");
        createExpense(user, "70.00", "Cena", TODAY.withDayOfMonth(1).minusDays(1), comida, "viaje");
        createExpense(user, "25.00", "ALMUERZO familiar", TODAY.withDayOfMonth(10), comida);
    }

    private List<String> descriptions(String query) throws Exception {
        return doGet(user, "/api/expenses" + query).expect(200).read("$.content[*].description");
    }

    @Test
    void listIsOrderedByDateDescendingThenIdDescending() throws Exception {
        Reply reply = doGet(user, "/api/expenses").expect(200);

        assertThat(reply.<List<String>>read("$.content[*].description")).containsExactly("Cine",
                "ALMUERZO familiar", "Taxi aeropuerto", "Almuerzo oficina", "Cena");
        assertThat(reply.<List<String>>read("$.content[*].date")).containsExactly("2026-11-15", "2026-11-10",
                "2026-11-10", "2026-11-01", "2026-10-31");
        // Same date: the newest id goes first.
        List<Number> ids = reply.read("$.content[*].id");
        assertThat(ids.get(1).longValue()).isGreaterThan(ids.get(2).longValue());
    }

    @Test
    void pageHasTheSpecShape() throws Exception {
        Reply reply = doGet(user, "/api/expenses").expect(200);

        Map<String, Object> page = reply.read("$");
        assertThat(page.keySet()).containsExactlyInAnyOrder("content", "page", "size", "totalElements",
                "totalPages");
        assertThat(page).containsEntry("page", 0).containsEntry("size", 20).containsEntry("totalElements", 5)
                .containsEntry("totalPages", 1);
    }

    @Test
    void emptyListMatchesTheSpecExample() throws Exception {
        Session empty = register();

        Reply reply = doGet(empty, "/api/expenses").expect(200);

        Map<String, Object> page = reply.read("$");
        assertThat(page.keySet()).containsExactlyInAnyOrder("content", "page", "size", "totalElements",
                "totalPages");
        assertThat(reply.<List<Object>>read("$.content")).isEmpty();
        assertThat(page).containsEntry("page", 0).containsEntry("size", 20).containsEntry("totalElements", 0)
                .containsEntry("totalPages", 0);
    }

    @Test
    void paginationSplitsTheListKeepingTheOrder() throws Exception {
        Reply first = doGet(user, "/api/expenses?page=0&size=2").expect(200);
        Reply second = doGet(user, "/api/expenses?page=1&size=2").expect(200);
        Reply third = doGet(user, "/api/expenses?page=2&size=2").expect(200);
        Reply beyond = doGet(user, "/api/expenses?page=3&size=2").expect(200);

        assertThat(first.<List<String>>read("$.content[*].description")).containsExactly("Cine",
                "ALMUERZO familiar");
        assertThat(second.<List<String>>read("$.content[*].description")).containsExactly("Taxi aeropuerto",
                "Almuerzo oficina");
        assertThat(third.<List<String>>read("$.content[*].description")).containsExactly("Cena");
        assertThat(beyond.<List<String>>read("$.content[*].description")).isEmpty();
        for (Reply page : List.of(first, second, third)) {
            assertThat(page.<Integer>read("$.size")).isEqualTo(2);
            assertThat(page.<Integer>read("$.totalElements")).isEqualTo(5);
            assertThat(page.<Integer>read("$.totalPages")).isEqualTo(3);
        }
        assertThat(first.<Integer>read("$.page")).isZero();
        assertThat(second.<Integer>read("$.page")).isEqualTo(1);
        assertThat(third.<Integer>read("$.page")).isEqualTo(2);
    }

    @Test
    void sizeOf100IsAcceptedAndMoreThan100IsNeverServed() throws Exception {
        assertThat(doGet(user, "/api/expenses?size=100").expect(200).<Integer>read("$.size")).isEqualTo(100);

        // The spec only says "100 como máximo": rejecting (400) or capping to 100 are both acceptable.
        Reply over = doGet(user, "/api/expenses?size=101");
        if (over.status() == 200) {
            assertThat(over.<Integer>read("$.size")).isLessThanOrEqualTo(100);
        } else {
            assertThat(over.status()).isEqualTo(400);
        }
    }

    @Test
    void descriptionFilterIgnoresCase() throws Exception {
        assertThat(descriptions("?description=almuerzo")).containsExactly("ALMUERZO familiar", "Almuerzo oficina");
        assertThat(descriptions("?description=ALMUERZO")).containsExactly("ALMUERZO familiar", "Almuerzo oficina");
        assertThat(descriptions("?description=AlMuErZo")).containsExactly("ALMUERZO familiar", "Almuerzo oficina");
    }

    @Test
    void descriptionFilterMatchesAnyPartOfTheText() throws Exception {
        assertThat(descriptions("?description=PUERTO")).containsExactly("Taxi aeropuerto");
        assertThat(descriptions("?description=ofi")).containsExactly("Almuerzo oficina");
        assertThat(descriptions("?description=nada-coincide")).isEmpty();
    }

    @Test
    void descriptionFilterIgnoresCaseOfAccentedLetters() throws Exception {
        createExpense(user, "12.00", "Café con Ñandú", TODAY, comida);

        assertThat(doGet(user, "/api/expenses?description={d}", "CAFÉ").expect(200)
                .<List<String>>read("$.content[*].description")).containsExactly("Café con Ñandú");
        assertThat(doGet(user, "/api/expenses?description={d}", "ñandÚ").expect(200)
                .<List<String>>read("$.content[*].description")).containsExactly("Café con Ñandú");
    }

    @Test
    void descriptionFilterTreatsWildcardsAsText() throws Exception {
        createExpense(user, "12.00", "Descuento 50% tienda", TODAY, comida);

        assertThat(doGet(user, "/api/expenses?description={d}", "%").expect(200)
                .<List<String>>read("$.content[*].description")).containsExactly("Descuento 50% tienda");
        assertThat(doGet(user, "/api/expenses?description={d}", "_").expect(200)
                .<List<String>>read("$.content[*].description")).isEmpty();
    }

    @Test
    void categoryFilterReturnsOnlyThatCategory() throws Exception {
        assertThat(descriptions("?categoryId=" + comida)).containsExactly("ALMUERZO familiar", "Almuerzo oficina",
                "Cena");
        assertThat(descriptions("?categoryId=" + transporte)).containsExactly("Taxi aeropuerto");
        assertThat(descriptions("?categoryId=" + categoryId(user, "Salud"))).isEmpty();
    }

    @Test
    void tagFilterReturnsOnlyExpensesWithThatTag() throws Exception {
        assertThat(descriptions("?tag=viaje")).containsExactly("Taxi aeropuerto", "Cena");
        assertThat(descriptions("?tag=trabajo")).containsExactly("Taxi aeropuerto", "Almuerzo oficina");
        assertThat(descriptions("?tag=ocio")).containsExactly("Cine");
        assertThat(descriptions("?tag=inexistente")).isEmpty();
        // A tag is matched whole, not as a substring.
        assertThat(descriptions("?tag=via")).isEmpty();
    }

    @Test
    void tagFilterDoesNotDuplicateExpensesWithSeveralTags() throws Exception {
        Reply reply = doGet(user, "/api/expenses?tag=trabajo").expect(200);

        assertThat(reply.<Integer>read("$.totalElements")).isEqualTo(2);
        assertThat(reply.<List<String>>read("$.content[?(@.description == 'Taxi aeropuerto')].tags[*]"))
                .containsExactlyInAnyOrder("trabajo", "viaje");
    }

    @Test
    void dateRangeIsInclusiveOnBothEnds() throws Exception {
        assertThat(descriptions("?startDate=2026-11-01&endDate=2026-11-10")).containsExactly("ALMUERZO familiar",
                "Taxi aeropuerto", "Almuerzo oficina");
        assertThat(descriptions("?startDate=2026-11-10&endDate=2026-11-10")).containsExactly("ALMUERZO familiar",
                "Taxi aeropuerto");
        assertThat(descriptions("?startDate=2026-11-02&endDate=2026-11-09")).isEmpty();
        assertThat(descriptions("?startDate=2026-10-31&endDate=2026-10-31")).containsExactly("Cena");
    }

    @Test
    void onlyOneEndOfTheDateRangeCanBeSent() throws Exception {
        assertThat(descriptions("?startDate=2026-11-10")).containsExactly("Cine", "ALMUERZO familiar",
                "Taxi aeropuerto");
        assertThat(descriptions("?endDate=2026-11-01")).containsExactly("Almuerzo oficina", "Cena");
        assertThat(descriptions("?startDate=2026-11-16")).isEmpty();
        assertThat(descriptions("?endDate=2026-10-30")).isEmpty();
    }

    @Test
    void filtersCombine() throws Exception {
        assertThat(descriptions("?categoryId=" + comida + "&tag=trabajo")).containsExactly("Almuerzo oficina");
        assertThat(descriptions("?categoryId=" + comida + "&tag=viaje")).containsExactly("Cena");
        assertThat(descriptions("?description=almuerzo&startDate=2026-11-05")).containsExactly("ALMUERZO familiar");
        assertThat(descriptions("?tag=viaje&startDate=2026-11-01&endDate=2026-11-30"))
                .containsExactly("Taxi aeropuerto");
        assertThat(descriptions("?categoryId=" + comida + "&startDate=2026-11-01&endDate=2026-11-10"))
                .containsExactly("ALMUERZO familiar", "Almuerzo oficina");
        assertThat(descriptions("?description=a&categoryId=" + transporte
                + "&tag=trabajo&startDate=2026-11-10&endDate=2026-11-10")).containsExactly("Taxi aeropuerto");
        assertThat(descriptions("?description=cine&categoryId=" + comida)).isEmpty();
    }

    @Test
    void filtersCombineWithPagination() throws Exception {
        Reply reply = doGet(user, "/api/expenses?categoryId=" + comida + "&page=1&size=2").expect(200);

        assertThat(reply.<List<String>>read("$.content[*].description")).containsExactly("Cena");
        assertThat(reply.<Integer>read("$.totalElements")).isEqualTo(3);
        assertThat(reply.<Integer>read("$.totalPages")).isEqualTo(2);
    }

    @Test
    void malformedFilterValuesAnswer400() throws Exception {
        doGet(user, "/api/expenses?startDate=15-11-2026").expect(400);
        doGet(user, "/api/expenses?categoryId=abc").expect(400);
        doGet(user, "/api/expenses?page=-1").expect(400);
        doGet(user, "/api/expenses?size=0").expect(400);
    }
}
