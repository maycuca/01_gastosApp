package com.gastosapp.backend.common;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import com.gastosapp.backend.common.ApiError.FieldErrorDetail;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final String INVALID_VALUE = "Valor inválido";

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handle(Exception exception) throws Exception {
        ApiError body = switch (exception) {
            // Let Spring Security's own handlers (401/403) deal with these.
            case AuthenticationException ex -> throw ex;
            case AccessDeniedException ex -> throw ex;

            case ApiException ex -> ApiError.of(ex.getStatus(), ex.getMessage());
            case FieldValidationException ex ->
                ApiError.validation(List.of(new FieldErrorDetail(ex.getField(), ex.getMessage())));
            case MethodArgumentNotValidException ex -> ApiError.validation(ex.getBindingResult().getFieldErrors()
                    .stream()
                    .map(error -> new FieldErrorDetail(error.getField(),
                            error.isBindingFailure() ? INVALID_VALUE : error.getDefaultMessage()))
                    .toList());
            case MethodArgumentTypeMismatchException ex ->
                ApiError.validation(List.of(new FieldErrorDetail(ex.getName(), INVALID_VALUE)));
            case MissingServletRequestParameterException ex ->
                ApiError.validation(List.of(new FieldErrorDetail(ex.getParameterName(), "Campo obligatorio")));
            case HttpMessageNotReadableException ex ->
                ApiError.of(HttpStatus.BAD_REQUEST, "El cuerpo de la petición no es válido");
            case DataIntegrityViolationException ex -> {
                log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
                yield ApiError.of(HttpStatus.CONFLICT, "El registro entra en conflicto con datos existentes");
            }
            // Remaining Spring MVC errors (unknown route, method not allowed, ...) keep their own status.
            case ErrorResponse ex -> {
                HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
                yield ApiError.of(status, messageFor(status));
            }
            default -> {
                log.error("Unexpected error", exception);
                yield ApiError.of(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno del servidor");
            }
        };
        ResponseEntity.BodyBuilder response = ResponseEntity.status(body.status());
        if (exception instanceof TooManyRequestsException ex) {
            response.header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()));
        }
        return response.body(body);
    }

    private static String messageFor(HttpStatus status) {
        return switch (status) {
            case NOT_FOUND -> "Recurso no encontrado";
            case METHOD_NOT_ALLOWED -> "Método no permitido";
            case UNSUPPORTED_MEDIA_TYPE -> "Tipo de contenido no soportado";
            case NOT_ACCEPTABLE -> "Formato de respuesta no soportado";
            case BAD_REQUEST -> "Petición inválida";
            default -> status.is5xxServerError() ? "Error interno del servidor" : "Petición inválida";
        };
    }
}
