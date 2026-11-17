package com.gastosapp.backend.category;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.gastosapp.backend.category.CategoryDtos.CategoryRequest;
import com.gastosapp.backend.category.CategoryDtos.CategoryResponse;
import com.gastosapp.backend.security.AuthenticatedUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public List<CategoryResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return categoryService.list(user.id());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryResponse create(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody CategoryRequest request) {
        return categoryService.create(user.id(), request);
    }

    @PutMapping("/{id}")
    public CategoryResponse update(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id,
            @Valid @RequestBody CategoryRequest request) {
        return categoryService.update(user.id(), id, request);
    }
}
