import type { AuthRequest, AuthResponse, PasswordChangeRequest, User } from '../types/api'
import { request } from './httpClient'

export function register(credentials: AuthRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', { method: 'POST', body: credentials, auth: false })
}

export function login(credentials: AuthRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', { method: 'POST', body: credentials, auth: false })
}

export function getCurrentUser(): Promise<User> {
  return request<User>('/api/auth/me')
}

/**
 * Answers `200` with `{ token, user }`, like the login. The backend invalidates every token
 * issued before the change, so the caller must store the new token to keep the session.
 * A wrong `currentPassword` answers `400` with `fieldErrors` (not `401`), so it does not end
 * the session; after 5 of them it answers `429` with `Retry-After`.
 */
export function changePassword(body: PasswordChangeRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/password', { method: 'PUT', body })
}
