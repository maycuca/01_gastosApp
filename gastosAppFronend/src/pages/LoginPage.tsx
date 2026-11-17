import { useCallback } from 'react'
import { Link } from 'react-router'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../hooks/useAuth'
import { ROUTES } from '../routes'
import type { AuthRequest } from '../types/api'
import { withWaitMessage } from '../utils/errors'

// After a successful login the session changes and PublicOnlyRoute redirects to the dashboard.
export function LoginPage() {
  const { login, sessionExpired } = useAuth()

  // A 429 (too many failed attempts) gets a message that says how long to wait.
  const handleLogin = useCallback(
    async (credentials: AuthRequest) => {
      try {
        await login(credentials)
      } catch (error) {
        throw withWaitMessage(error)
      }
    },
    [login],
  )

  return (
    <div className="page-center">
      <section className="card auth-card">
        <h1>Mis Gastos</h1>
        <p className="muted">Inicia sesión para ver tus gastos.</p>
        {sessionExpired && (
          <p className="alert alert-warning" role="status">
            Tu sesión terminó. Inicia sesión de nuevo.
          </p>
        )}
        <AuthForm mode="login" onSubmit={handleLogin} />
        <p className="auth-switch">
          ¿No tienes cuenta? <Link to={ROUTES.register}>Regístrate</Link>
        </p>
      </section>
    </div>
  )
}
