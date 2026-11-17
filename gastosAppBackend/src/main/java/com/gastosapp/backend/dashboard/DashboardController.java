package com.gastosapp.backend.dashboard;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.gastosapp.backend.dashboard.DashboardDtos.SummaryResponse;
import com.gastosapp.backend.period.Period;
import com.gastosapp.backend.security.AuthenticatedUser;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/summary")
    public SummaryResponse summary(@AuthenticationPrincipal AuthenticatedUser user, @RequestParam Period period) {
        return dashboardService.summary(user.id(), period);
    }
}
