import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, installApi, json, renderAppAt, summary } from '../test/fakeApi'
import type { ApiHandler } from '../test/fakeApi'
import { getToken } from '../services/tokenStorage'
import type { Period } from '../types/api'

function authApi(override?: ApiHandler) {
  return installApi((call) => {
    const overridden = override?.(call)
    if (overridden) return overridden
    if (call.path === '/api/auth/register' || call.path === '/api/auth/login') {
      return json(call.path.endsWith('register') ? 201 : 200, { token: 'new-token', user: { id: 7, username: 'ana' } })
    }
    if (call.path === '/api/dashboard/summary') return json(200, summary(call.query.get('period') as Period))
    return undefined
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Register and login', () => {
  it('registers, stores the token and lands on the dashboard', async () => {
    const api = authApi()
    const user = userEvent.setup()
    renderAppAt('/registro', { loggedIn: false })

    await user.type(screen.getByLabelText('Usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Este mes' })).toBeInTheDocument()
    const call = api.lastCallTo('POST', '/api/auth/register')
    expect(call.body).toEqual({ username: 'ana', password: 'secreto-123' })
    expect(call.authorization).toBeNull()
    expect(getToken()).toBe('new-token')
    // Later requests carry the stored token.
    expect(api.lastCallTo('GET', '/api/dashboard/summary').authorization).toBe('Bearer new-token')
  })

  it('validates username and password length before calling the API', async () => {
    const api = authApi()
    const user = userEvent.setup()
    renderAppAt('/registro', { loggedIn: false })

    await user.type(screen.getByLabelText('Usuario'), 'ab')
    await user.type(screen.getByLabelText('Contraseña'), '1234567')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(screen.getByLabelText('Usuario')).toHaveAccessibleDescription('Debe tener entre 3 y 30 caracteres')
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Debe tener al menos 8 caracteres')
    expect(api.callsTo('POST', '/api/auth/register')).toHaveLength(0)
  })

  it('shows the 409 of a repeated username', async () => {
    authApi((call) =>
      call.path === '/api/auth/register' ? apiError(409, 'El nombre de usuario ya está en uso') : undefined,
    )
    const user = userEvent.setup()
    renderAppAt('/registro', { loggedIn: false })

    await user.type(screen.getByLabelText('Usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El nombre de usuario ya está en uso')
    expect(getToken()).toBeNull()
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument()
  })

  it('logs in and lands on the dashboard', async () => {
    const api = authApi()
    const user = userEvent.setup()
    renderAppAt('/login', { loggedIn: false })

    await user.type(screen.getByLabelText('Usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Este mes' })).toBeInTheDocument()
    expect(api.lastCallTo('POST', '/api/auth/login').body).toEqual({ username: 'ana', password: 'secreto-123' })
    expect(getToken()).toBe('new-token')
  })

  it('shows wrong credentials without treating the 401 as an expired session', async () => {
    authApi((call) => (call.path === '/api/auth/login' ? apiError(401, 'Credenciales incorrectas') : undefined))
    const user = userEvent.setup()
    renderAppAt('/login', { loggedIn: false })

    await user.type(screen.getByLabelText('Usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), 'equivocada')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas')
    expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeInTheDocument()
  })

  it.each(['/gastos', '/categorias', '/limites'])(
    'returns to the login page when %s answers 401',
    async (path) => {
      installApi(() => apiError(401, 'Token ausente, inválido o vencido'))
      renderAppAt(path)

      expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
      await waitFor(() => expect(getToken()).toBeNull())
    },
  )
})
