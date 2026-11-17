package com.gastosapp.backend.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Spec sections 2 (Category), 3 (Categorías), 4 (Categorías) and 6 (Categorías). */
class CategoryApiTest extends ApiTestSupport {

    private Session user;

    @BeforeEach
    void setUpUser() throws Exception {
        user = register();
    }

    private static Map<String, Object> category(String name, String color) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("color", color);
        return body;
    }

    @Test
    void createsACategory() throws Exception {
        Reply reply = doPost(user, "/api/categories", category("Mascotas", "#12AB9F"));

        reply.expect(201);
        Map<String, Object> body = reply.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("id", "name", "color");
        assertThat(body).containsEntry("name", "Mascotas").containsEntry("color", "#12AB9F");
        List<String> names = doGet(user, "/api/categories").expect(200).read("$[*].name");
        assertThat(names).hasSize(8).contains("Mascotas");
    }

    @Test
    void listIsOrderedByName() throws Exception {
        doPost(user, "/api/categories", category("Zapatos", "#000000")).expect(201);
        doPost(user, "/api/categories", category("Ahorro", "#FFFFFF")).expect(201);
        doPost(user, "/api/categories", category("mascotas", "#123456")).expect(201);

        List<String> names = doGet(user, "/api/categories").expect(200).read("$[*].name");

        assertThat(names).containsExactly("Ahorro", "Comida", "Entretenimiento", "mascotas", "Otros", "Salud",
                "Servicios", "Transporte", "Vivienda", "Zapatos");
    }

    @Test
    void editsNameAndColor() throws Exception {
        long id = categoryId(user, "Otros");

        Reply reply = doPut(user, "/api/categories/" + id, category("Varios", "#0A0B0C"));

        reply.expect(200);
        Map<String, Object> body = reply.read("$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("id", "name", "color");
        assertThat(body).containsEntry("name", "Varios").containsEntry("color", "#0A0B0C");
        assertThat(((Number) body.get("id")).longValue()).isEqualTo(id);
        Reply list = doGet(user, "/api/categories").expect(200);
        assertThat(list.<List<String>>read("$[*].name")).contains("Varios").doesNotContain("Otros").hasSize(7);
        assertThat(list.<List<String>>read("$[?(@.name == 'Varios')].color")).containsExactly("#0A0B0C");
    }

    @Test
    void canChangeOnlyTheColorKeepingTheName() throws Exception {
        long id = categoryId(user, "Salud");

        doPut(user, "/api/categories/" + id, category("Salud", "#00FF00")).expect(200);
        // Changing only the letter case of its own name is not a duplicate either.
        doPut(user, "/api/categories/" + id, category("SALUD", "#00FF00")).expect(200);

        assertThat(doGet(user, "/api/categories").<List<String>>read("$[?(@.name == 'SALUD')].color"))
                .containsExactly("#00FF00");
    }

    @ParameterizedTest
    @ValueSource(strings = { "Comida", "comida", "COMIDA", "  Comida  " })
    void repeatedNameOnCreateAnswers409(String name) throws Exception {
        Reply reply = doPost(user, "/api/categories", category(name, "#123456"));

        assertPlainError(reply, 409, "Conflict");
        assertThat(doGet(user, "/api/categories").<List<Object>>read("$")).hasSize(7);
    }

    @Test
    void repeatedNameOnEditAnswers409() throws Exception {
        long otros = categoryId(user, "Otros");

        assertPlainError(doPut(user, "/api/categories/" + otros, category("Comida", "#123456")), 409, "Conflict");
        assertPlainError(doPut(user, "/api/categories/" + otros, category("cOMIDA", "#123456")), 409, "Conflict");

        assertThat(doGet(user, "/api/categories").<List<String>>read("$[*].name")).contains("Otros", "Comida");
    }

    @Test
    void repeatedNameWithAccentsIsDetectedIgnoringCase() throws Exception {
        doPost(user, "/api/categories", category("Educación", "#123456")).expect(201);

        assertPlainError(doPost(user, "/api/categories", category("EDUCACIÓN", "#123456")), 409, "Conflict");
    }

    @Test
    void nameIsRequiredAndLimitedTo50Characters() throws Exception {
        assertValidationError(doPost(user, "/api/categories", category("", "#123456")), "name");
        assertValidationError(doPost(user, "/api/categories", category("   ", "#123456")), "name");
        assertValidationError(doPost(user, "/api/categories", category("a".repeat(51), "#123456")), "name");
        doPost(user, "/api/categories", category("a".repeat(50), "#123456")).expect(201);
    }

    @ParameterizedTest
    @ValueSource(strings = { "", "rojo", "#FFF", "123456", "#12345G", "#1234567" })
    void colorMustBeRRGGBB(String color) throws Exception {
        assertValidationError(doPost(user, "/api/categories", category("Nueva", color)), "color");

        long otros = categoryId(user, "Otros");
        assertValidationError(doPut(user, "/api/categories/" + otros, category("Otros", color)), "color");
    }

    @Test
    void missingFieldsAnswer400() throws Exception {
        assertValidationError(doPost(user, "/api/categories", "{}"), "name", "color");
    }

    @Test
    void editingANonexistentCategoryAnswers404() throws Exception {
        assertPlainError(doPut(user, "/api/categories/999999999", category("Nada", "#123456")), 404, "Not Found");
    }

    @Test
    void thereIsNoDeleteForCategories() throws Exception {
        long id = categoryId(user, "Otros");

        Reply single = doDelete(user, "/api/categories/" + id);
        Reply collection = doDelete(user, "/api/categories");

        assertThat(single.status()).as("DELETE /api/categories/{id}").isIn(404, 405);
        assertThat(collection.status()).as("DELETE /api/categories").isIn(404, 405);
        assertThat(doGet(user, "/api/categories").<List<String>>read("$[*].name")).contains("Otros").hasSize(7);
    }

    @Test
    void categoryWithExpensesKeepsItsExpensesAfterEdit() throws Exception {
        long comida = categoryId(user, "Comida");
        createExpense(user, "10.00", "Almuerzo", TODAY, comida);

        doPut(user, "/api/categories/" + comida, category("Comida y bebida", "#FF0000")).expect(200);

        Reply list = doGet(user, "/api/expenses?categoryId=" + comida).expect(200);
        assertThat(list.<Integer>read("$.totalElements")).isEqualTo(1);
        assertThat(list.<String>read("$.content[0].category.name")).isEqualTo("Comida y bebida");
    }
}
