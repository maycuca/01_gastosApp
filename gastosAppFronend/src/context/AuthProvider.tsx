import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import * as authService from '../services/authService'
import { ApiError, setUnauthorizedHandler } from '../services/httpClient'
import { clearToken, getToken, setToken } from '../services/tokenStorage'
import type { AuthRequest, AuthResponse, PasswordChangeRequest, User } from '../types/api'
import { getErrorMessage } from '../utils/errors'
import { AuthContext } from './authContext'
import type { AuthContextValue, AuthStatus } from './authContext'

interface AuthState {
  status: AuthStatus
  user: User | null
  sessionExpired: boolean
  errorMessage: string | null
}

const ANONYMOUS: AuthState = { status: 'anonymous', user: null, sessionExpired: false, errorMessage: null }
const LOADING: AuthState = { status: 'loading', user: null, sessionExpired: false, errorMessage: null }

function initialState(): AuthState {
  return getToken() ? LOADING : ANONYMOUS
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)
  const [attempt, setAttempt] = useState(0)

  // A 401 from any protected endpoint ends the session; the router then shows the login page.
  useEffect(() => {
    return setUnauthorizedHandler(() => {
      setState({ ...ANONYMOUS, sessionExpired: true })
    })
  }, [])

  // Restore the session of a stored token.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    authService
      .getCurrentUser()
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user, sessionExpired: false, errorMessage: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // A 401 was already handled by the unauthorized handler.
        if (error instanceof ApiError && error.status === 401) return
        setState({ status: 'error', user: null, sessionExpired: false, errorMessage: getErrorMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const startSession = useCallback((response: AuthResponse) => {
    setToken(response.token)
    setState({ status: 'authenticated', user: response.user, sessionExpired: false, errorMessage: null })
  }, [])

  const login = useCallback(
    async (credentials: AuthRequest) => {
      startSession(await authService.login(credentials))
    },
    [startSession],
  )

  const register = useCallback(
    async (credentials: AuthRequest) => {
      startSession(await authService.register(credentials))
    },
    [startSession],
  )

  // The backend invalidates the previous tokens: the returned one replaces the stored one.
  const changePassword = useCallback(
    async (body: PasswordChangeRequest) => {
      startSession(await authService.changePassword(body))
    },
    [startSession],
  )

  // There is no logout endpoint: closing the session is discarding the token.
  const logout = useCallback(() => {
    clearToken()
    setState(ANONYMOUS)
  }, [])

  const retry = useCallback(() => {
    setState(initialState())
    setAttempt((current) => current + 1)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, changePassword, logout, retry }),
    [state, login, register, changePassword, logout, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
