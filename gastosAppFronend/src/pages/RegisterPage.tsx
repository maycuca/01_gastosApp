import { Link } from 'react-router'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../hooks/useAuth'
import { ROUTES } from '../routes'

// After a successful registration the session changes and PublicOnlyRoute redirects to the dashboard.
export function RegisterPage() {
  const { register } = useAuth()

  return (
    <div className="page-center">
      <section className="card auth-card">
        <h1>Crear cuenta</h1>
        <p className="muted">Regístrate para empezar a registrar tus gastos.</p>
        <AuthForm mode="register" onSubmit={register} />
        <p className="auth-switch">
          ¿Ya tienes cuenta? <Link to={ROUTES.login}>Inicia sesión</Link>
        </p>
      </section>
    </div>
  )
}
