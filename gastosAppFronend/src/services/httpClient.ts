import type { ApiErrorBody, FieldError } from '../types/api'
import { clearToken, getToken } from './tokenStorage'

export const LOGIN_PATH = '/login'

/** Error thrown by every service call. `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly status: number
  readonly error: string
  readonly fieldErrors: FieldError[]
  /** Seconds from the `Retry-After` header (sent with a `429`); `null` when absent or not a number of seconds. */
  readonly retryAfterSeconds: number | null

  constructor(
    status: number,
    error: string,
    message: string,
    fieldErrors: FieldError[] = [],
    retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.error = error
    this.fieldErrors = fieldErrors
    this.retryAfterSeconds = retryAfterSeconds
  }
}

type UnauthorizedHandler = () => void

function defaultUnauthorizedHandler(): void {
  if (window.location.pathname !== LOGIN_PATH) {
    window.location.assign(LOGIN_PATH)
  }
}

let unauthorizedHandler: UnauthorizedHandler = defaultUnauthorizedHandler

/**
 * Registers what "redirect to login" means for the running app (the auth provider
 * uses it to drop the session so the router sends the user to the login page).
 * Returns a function that restores the default full-page redirect.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = defaultUnauthorizedHandler
    }
  }
}

export type QueryValue = string | number | undefined | null
export type QueryParams = Record<string, QueryValue>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: QueryParams
  /**
   * `false` for the public endpoints (register and login): no token is sent and a
   * 401 means "wrong credentials", so it does not end the session.
   */
  auth?: boolean
  signal?: AbortSignal
}

function buildUrl(path: string, query?: QueryParams): string {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.append(key, String(value))
  }
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseFieldErrors(value: unknown): FieldError[] {
  if (!Array.isArray(value)) return []
  const result: FieldError[] = []
  for (const item of value) {
    if (isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string') {
      result.push({ field: item.field, message: item.message })
    }
  }
  return result
}

function fallbackMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Datos inválidos'
    case 401:
      return 'No autorizado'
    case 404:
      return 'No se encontró el recurso solicitado'
    case 409:
      return 'Ya existe un registro con esos datos'
    case 429:
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
    default:
      return status >= 500
        ? 'El servidor no está disponible. Intenta de nuevo más tarde.'
        : `Ocurrió un error inesperado (${status})`
  }
}

/** The spec sends `Retry-After` in seconds; any other form (such as an HTTP date) is ignored. */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // Body is empty or not JSON (for example, the dev proxy when the backend is down).
  }
  const parsed: Partial<ApiErrorBody> = isRecord(body) ? body : {}
  const message =
    typeof parsed.message === 'string' && parsed.message.trim() !== ''
      ? parsed.message
      : fallbackMessage(response.status)
  const error = typeof parsed.error === 'string' ? parsed.error : response.statusText
  return new ApiError(
    response.status,
    error,
    message,
    parseFieldErrors(parsed.fieldErrors),
    parseRetryAfter(response.headers.get('Retry-After')),
  )
}

/**
 * Single entry point for every API call. Adds the bearer token, parses the spec's
 * error format and, on a 401 from a protected endpoint, clears the token and
 * redirects to the login page. Any other status (a 429 included) only rejects:
 * it never ends the session.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal } = options

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiError(0, 'Network Error', 'No se pudo conectar con el servidor')
  }

  if (!response.ok) {
    const apiError = await toApiError(response)
    if (response.status === 401 && auth) {
      clearToken()
      unauthorizedHandler()
    }
    throw apiError
  }

  if (response.status === 204) {
    return undefined as T
  }
  const text = await response.text()
  if (text === '') {
    return undefined as T
  }
  return JSON.parse(text) as T
}
