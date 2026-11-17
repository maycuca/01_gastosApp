package com.gastosapp.backend.category;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class CategoryDtos {

    private CategoryDtos() {
    }

    public record CategoryRequest(
            @NotBlank(message = "Campo obligatorio")
            @Size(max = 50, message = "Debe tener entre 1 y 50 caracteres")
            String name,

            @NotNull(message = "Campo obligatorio")
            @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Debe tener el formato #RRGGBB")
            String color) {

        public CategoryRequest {
            name = name == null ? null : name.strip();
        }
    }

    public record CategoryResponse(Long id, String name, String color) {

        public static CategoryResponse from(Category category) {
            return new CategoryResponse(category.getId(), category.getName(), category.getColor());
        }
    }
}
