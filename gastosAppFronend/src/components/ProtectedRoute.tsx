import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { ROUTES } from '../routes'
import { ErrorState, Loading } from './StatusViews'

/** Renders the nested routes only with a session; otherwise sends the user to the login page. */
export function ProtectedRoute() {
  const { status, errorMessage, retry, logout } = useAuth()

  if (status === 'loading') {
    return (
      <div className="page-center">
        <Loading label="Verificando sesión…" />
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="page-center">
        <div className="card">
          <ErrorState message={errorMessage ?? 'No se pudo verificar la sesión'} onRetry={retry} />
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }
  if (status === 'anonymous') {
    return <Navigate to={ROUTES.login} replace />
  }
  return <Outlet />
}

/** Login and register are only for visitors without a session. */
export function PublicOnlyRoute() {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="page-center">
        <Loading label="Verificando sesión…" />
      </div>
    )
  }
  if (status === 'authenticated' || status === 'error') {
    return <Navigate to={ROUTES.dashboard} replace />
  }
  return <Outlet />
}
