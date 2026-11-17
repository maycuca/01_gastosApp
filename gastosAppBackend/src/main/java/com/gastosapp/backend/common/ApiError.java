package com.gastosapp.backend.common;

import java.util.List;

import org.springframework.http.HttpStatus;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Error body defined by the spec. {@code fieldErrors} is only present for validation errors. */
public record ApiError(
        int status,
        String error,
        String message,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<FieldErrorDetail> fieldErrors) {

    public record FieldErrorDetail(String field, String message) {
    }

    public static ApiError of(HttpStatus status, String message) {
        return new ApiError(status.value(), status.getReasonPhrase(), message, null);
    }

    public static ApiError validation(List<FieldErrorDetail> fieldErrors) {
        HttpStatus status = HttpStatus.BAD_REQUEST;
        return new ApiError(status.value(), status.getReasonPhrase(), "Datos inválidos", fieldErrors);
    }
}
