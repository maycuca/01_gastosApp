package com.gastosapp.backend.category;

import java.text.Collator;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.gastosapp.backend.category.CategoryDtos.CategoryRequest;
import com.gastosapp.backend.category.CategoryDtos.CategoryResponse;
import com.gastosapp.backend.common.ApiException;

@Service
public class CategoryService {

    /** Categories every user receives on registration (name -> chart color). */
    private static final Map<String, String> DEFAULT_CATEGORIES = defaultCategories();

    private final CategoryRepository categoryRepository;
    private final Clock clock;

    public CategoryService(CategoryRepository categoryRepository, Clock clock) {
        this.categoryRepository = categoryRepository;
        this.clock = clock;
    }

    @Transactional
    public void createDefaults(Long userId) {
        LocalDateTime now = LocalDateTime.now(clock);
        DEFAULT_CATEGORIES.forEach((name, color) -> categoryRepository.save(new Category(userId, name, color, now)));
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> list(Long userId) {
        Collator collator = Collator.getInstance(Locale.of("es"));
        collator.setStrength(Collator.SECONDARY);
        return categoryRepository.findByUserId(userId).stream()
                .sorted(Comparator.comparing(Category::getName, collator).thenComparing(Category::getId))
                .map(CategoryResponse::from)
                .toList();
    }

    @Transactional
    public CategoryResponse create(Long userId, CategoryRequest request) {
        ensureNameIsFree(userId, request.name(), null);
        Category category = new Category(userId, request.name(), request.color(), LocalDateTime.now(clock));
        return CategoryResponse.from(categoryRepository.save(category));
    }

    @Transactional
    public CategoryResponse update(Long userId, Long id, CategoryRequest request) {
        Category category = getOwned(userId, id);
        ensureNameIsFree(userId, request.name(), id);
        category.update(request.name(), request.color(), LocalDateTime.now(clock));
        return CategoryResponse.from(category);
    }

    /** Category of that user, or 404 (also when it belongs to someone else). */
    public Category getOwned(Long userId, Long id) {
        return categoryRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> ApiException.notFound("Categoría no encontrada"));
    }

    private void ensureNameIsFree(Long userId, String name, Long ignoredId) {
        boolean taken = categoryRepository.findByUserId(userId).stream()
                .anyMatch(other -> !other.getId().equals(ignoredId) && sameName(other.getName(), name));
        if (taken) {
            throw ApiException.conflict("Ya existe una categoría con ese nombre");
        }
    }

    private static boolean sameName(String a, String b) {
        return a.toLowerCase(Locale.ROOT).equals(b.toLowerCase(Locale.ROOT));
    }

    private static Map<String, String> defaultCategories() {
        Map<String, String> defaults = new LinkedHashMap<>();
        defaults.put("Comida", "#FF8A00");
        defaults.put("Transporte", "#2196F3");
        defaults.put("Vivienda", "#8E24AA");
        defaults.put("Servicios", "#00ACC1");
        defaults.put("Salud", "#E53935");
        defaults.put("Entretenimiento", "#43A047");
        defaults.put("Otros", "#757575");
        return defaults;
    }
}
