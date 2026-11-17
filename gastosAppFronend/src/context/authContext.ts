import { createContext } from 'react'
import type { AuthRequest, PasswordChangeRequest, User } from '../types/api'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  /** True when the session ended because the API answered 401. */
  sessionExpired: boolean
  /** Message when the stored session could not be verified (status `error`). */
  errorMessage: string | null
  login: (credentials: AuthRequest) => Promise<void>
  register: (credentials: AuthRequest) => Promise<void>
  /**
   * Changes the password and stores the token it returns (the previous ones stop working),
   * so the session continues.
   */
  changePassword: (body: PasswordChangeRequest) => Promise<void>
  logout: () => void
  /** Re-checks the stored token against `/api/auth/me`. */
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
