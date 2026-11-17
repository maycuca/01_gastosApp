package com.gastosapp.backend.expense;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.gastosapp.backend.common.PageResponse;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseCreateRequest;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseFilter;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseResponse;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseResult;
import com.gastosapp.backend.expense.ExpenseDtos.ExpenseUpdateRequest;
import com.gastosapp.backend.security.AuthenticatedUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/expenses")
public class ExpenseController {

    private final ExpenseService expenseService;

    public ExpenseController(ExpenseService expenseService) {
        this.expenseService = expenseService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ExpenseResult create(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody ExpenseCreateRequest request) {
        return expenseService.create(user.id(), request);
    }

    @GetMapping
    public PageResponse<ExpenseResponse> search(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @ModelAttribute ExpenseFilter filter) {
        return expenseService.search(user.id(), filter);
    }

    @GetMapping("/{id}")
    public ExpenseResponse get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        return expenseService.get(user.id(), id);
    }

    @PutMapping("/{id}")
    public ExpenseResult update(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id,
            @Valid @RequestBody ExpenseUpdateRequest request) {
        return expenseService.update(user.id(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        expenseService.delete(user.id(), id);
    }
}
