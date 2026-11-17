import { ApiError } from '../services/httpClient'
import type { FieldError } from '../types/api'

export type FieldErrorMap = Record<string, string>

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message !== '') return error.message
  return 'Ocurrió un error inesperado'
}

/** `tags[0]` or `tags[0].name` -> `tags`, so indexed errors land on their form field. */
export function baseFieldName(field: string): string {
  const cut = field.search(/[.[]/)
  return cut === -1 ? field : field.slice(0, cut)
}

/** Groups the backend `fieldErrors` by form field, joining several messages for one field. */
export function toFieldErrorMap(fieldErrors: readonly FieldError[]): FieldErrorMap {
  const map: FieldErrorMap = {}
  for (const { field, message } of fieldErrors) {
    const key = baseFieldName(field)
    map[key] = map[key] ? `${map[key]}. ${message}` : message
  }
  return map
}

/**
 * Lockout of spec section 1: after 5 failed logins (or 5 wrong current passwords when changing it),
 * 15 minutes. Used when `Retry-After` is missing.
 */
export const LOGIN_LOCKOUT_MINUTES = 15

/** "en 1 minuto", "en 15 minutos", "en menos de un minuto". */
export function waitInMinutes(seconds: number): string {
  if (seconds < 60) return 'en menos de un minuto'
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'en 1 minuto' : `en ${minutes} minutos`
}

/** Message for a `429` on login or password change, from the `Retry-After` seconds when the backend sent them. */
export function tooManyAttemptsMessage(retryAfterSeconds: number | null): string {
  const when =
    retryAfterSeconds === null ? `en unos minutos (como máximo ${LOGIN_LOCKOUT_MINUTES})` : waitInMinutes(retryAfterSeconds)
  return `Demasiados intentos fallidos para este usuario. Vuelve a intentarlo ${when}.`
}

/**
 * A `429` (too many failed attempts) gets a message that says how long to wait; any other
 * error is returned unchanged.
 */
export function withWaitMessage(error: unknown): unknown {
  if (error instanceof ApiError && error.status === 429) {
    return new ApiError(429, error.error, tooManyAttemptsMessage(error.retryAfterSeconds), [], error.retryAfterSeconds)
  }
  return error
}
