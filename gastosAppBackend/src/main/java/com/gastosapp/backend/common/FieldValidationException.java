package com.gastosapp.backend.common;

/** Validation failure detected outside Bean Validation; rendered as a 400 with {@code fieldErrors}. */
public class FieldValidationException extends RuntimeException {

    private final String field;

    public FieldValidationException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
