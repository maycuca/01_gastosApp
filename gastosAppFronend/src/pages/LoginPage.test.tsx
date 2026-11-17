import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../context/AuthProvider'
import { login } from '../services/authService'
import { getToken, setToken } from '../services/tokenStorage'
import { installApi, renderAppAt } from '../test/fakeApi'
import { LoginPage } from './LoginPage'

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('renders the login form in Spanish', () => {
    renderLogin()

    expect(screen.getByLabelText('Usuario')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Regístrate' })).toHaveAttribute('href', '/registro')
  })

  it('asks for the credentials before calling the API', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(screen.getByText('Escribe tu usuario')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña')).toBeInTheDocument()
  })
})

describe('LoginPage: too many attempts (429)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function tooManyAttempts(retryAfter?: string): Response {
    return new Response(
      JSON.stringify({ status: 429, error: 'Too Many Requests', message: 'Demasiados intentos' }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...(retryAfter ? { 'Retry-After': retryAfter } : {}) },
      },
    )
  }

  async function tryToLogIn() {
    const user = userEvent.setup()
    renderAppAt('/login', { loggedIn: false })
    await user.type(await screen.findByLabelText('Usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
  }

  it('says there were too many attempts and how many minutes to wait, from Retry-After', async () => {
    const api = installApi((call) => (call.path === '/api/auth/login' ? tooManyAttempts('840') : undefined))

    await tryToLogIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos fallidos para este usuario. Vuelve a intentarlo en 14 minutos.',
    )
    expect(api.callsTo('POST', '/api/auth/login')).toHaveLength(1)
    // It is not a 401: no "session ended" notice, and the user stays on the login form.
    expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Usuario')).toHaveValue('ana')
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toHaveFocus()
  })

  it('rounds a wait shorter than a minute in a readable way', async () => {
    installApi((call) => (call.path === '/api/auth/login' ? tooManyAttempts('45') : undefined))

    await tryToLogIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('Vuelve a intentarlo en menos de un minuto.')
  })

  it('still explains the wait when Retry-After is missing', async () => {
    installApi((call) => (call.path === '/api/auth/login' ? tooManyAttempts() : undefined))

    await tryToLogIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Demasiados intentos fallidos para este usuario. Vuelve a intentarlo en unos minutos (como máximo 15).',
    )
  })

  it('does not end a session that is open in the app', async () => {
    setToken('valid-token')
    installApi((call) => (call.path === '/api/auth/login' ? tooManyAttempts('900') : undefined))
    // Independent of the page: a 429 from the API never clears the stored token.
    await expect(login({ username: 'ana', password: 'x' })).rejects.toMatchObject({ status: 429 })
    expect(getToken()).toBe('valid-token')
  })
})
