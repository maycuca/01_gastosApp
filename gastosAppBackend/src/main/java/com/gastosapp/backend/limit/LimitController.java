package com.gastosapp.backend.limit;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.gastosapp.backend.limit.LimitDtos.LimitRequest;
import com.gastosapp.backend.limit.LimitDtos.LimitResponse;
import com.gastosapp.backend.period.Period;
import com.gastosapp.backend.security.AuthenticatedUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/limits")
public class LimitController {

    private final LimitService limitService;

    public LimitController(LimitService limitService) {
        this.limitService = limitService;
    }

    @GetMapping
    public List<LimitResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return limitService.list(user.id());
    }

    @PutMapping("/{period}")
    public LimitResponse put(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Period period,
            @Valid @RequestBody LimitRequest request) {
        return limitService.put(user.id(), period, request);
    }

    @DeleteMapping("/{period}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Period period) {
        limitService.delete(user.id(), period);
    }
}
