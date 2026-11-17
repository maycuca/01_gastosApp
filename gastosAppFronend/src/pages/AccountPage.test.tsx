import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToken } from '../services/tokenStorage'
import { apiError, installApi, json, renderAppAt, summary } from '../test/fakeApi'
import type { ApiHandler } from '../test/fakeApi'
import type { Period } from '../types/api'

const NEW_TOKEN = 'new-token'

/** Body of a successful `PUT /api/auth/password`: the same as the login. */
function passwordChanged(): Response {
  return json(200, { token: NEW_TOKEN, user: { id: 1, username: 'ana' } })
}

function accountApi(override?: ApiHandler) {
  let changed = false
  return installApi((call) => {
    const overridden = override?.(call)
    if (overridden) return overridden
    // Like the backend: after the change, the tokens issued before it stop working.
    if (changed && call.authorization !== `Bearer ${NEW_TOKEN}`) return apiError(401, 'Token inválido')
    if (call.method === 'PUT' && call.path === '/api/auth/password') {
      changed = true
      return passwordChanged()
    }
    if (call.path === '/api/dashboard/summary') return json(200, summary(call.query.get('period') as Period))
    if (call.path === '/api/categories') return json(200, [])
    return undefined
  })
}

async function openAccount() {
  renderAppAt('/cuenta')
  await screen.findByRole('heading', { level: 1, name: 'Cuenta' })
}

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirmation: string) {
  if (current) await user.type(screen.getByLabelText('Contraseña actual'), current)
  if (next) await user.type(screen.getByLabelText('Contraseña nueva'), next)
  if (confirmation) await user.type(screen.getByLabelText('Confirmar contraseña nueva'), confirmation)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountPage: navigation', () => {
  it('is reached from the user name in the menu, which is marked as active there', async () => {
    accountApi()
    const user = userEvent.setup()
    renderAppAt('/')
    await screen.findByTestId('total-spent')

    const link = screen.getByRole('link', { name: 'Cuenta: ana' })
    expect(link).toHaveAttribute('href', '/cuenta')
    expect(link).toHaveTextContent('ana')
    expect(link).not.toHaveClass('nav-link-active')

    await user.click(link)

    expect(await screen.findByRole('heading', { level: 1, name: 'Cuenta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cuenta: ana' })).toHaveClass('nav-link-active')
    expect(screen.getByRole('link', { name: 'Cuenta: ana' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveClass('nav-link-active')
  })

  it('requires a session', async () => {
    accountApi()
    renderAppAt('/cuenta', { loggedIn: false })

    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})

describe('AccountPage: change the password', () => {
  it('uses stable ids, names and the right autocomplete for password managers', async () => {
    accountApi()
    await openAccount()

    const current = screen.getByLabelText('Contraseña actual')
    const next = screen.getByLabelText('Contraseña nueva')
    const confirmation = screen.getByLabelText('Confirmar contraseña nueva')
    expect(current).toHaveAttribute('type', 'password')
    expect(current).toHaveAttribute('id', 'current-password')
    expect(current).toHaveAttribute('name', 'current-password')
    expect(current).toHaveAttribute('autocomplete', 'current-password')
    expect(next).toHaveAttribute('type', 'password')
    expect(next).toHaveAttribute('id', 'new-password')
    expect(next).toHaveAttribute('name', 'new-password')
    expect(next).toHaveAttribute('autocomplete', 'new-password')
    expect(confirmation).toHaveAttribute('type', 'password')
    expect(confirmation).toHaveAttribute('id', 'confirm-new-password')
    expect(confirmation).toHaveAttribute('autocomplete', 'new-password')
  })

  it('sends only the current and the new password, clears the form and keeps the session', async () => {
    const api = accountApi()
    const user = userEvent.setup()
    await openAccount()

    await fill(user, 'vieja-clave', 'nueva-clave-1', 'nueva-clave-1')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Contraseña cambiada.')
    expect(notice).toHaveFocus()
    const call = api.lastCallTo('PUT', '/api/auth/password')
    expect(call.body).toEqual({ currentPassword: 'vieja-clave', newPassword: 'nueva-clave-1' })
    expect(call.authorization).toBe('Bearer valid-token')
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('')
    expect(screen.getByLabelText('Confirmar contraseña nueva')).toHaveValue('')
    // The session continues with the new token: still on the page, menu still there.
    expect(getToken()).toBe(NEW_TOKEN)
    expect(screen.getByRole('heading', { level: 1, name: 'Cuenta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cuenta: ana' })).toBeInTheDocument()
  })

  it('uses the new token in the next requests, since the old one no longer works', async () => {
    const api = accountApi()
    const user = userEvent.setup()
    await openAccount()

    await fill(user, 'vieja-clave', 'nueva-clave-1', 'nueva-clave-1')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    await screen.findByText('Contraseña cambiada.')

    await user.click(screen.getByRole('link', { name: 'Dashboard' }))

    expect(await screen.findByTestId('total-spent')).toBeInTheDocument()
    expect(api.lastCallTo('GET', '/api/dashboard/summary').authorization).toBe(`Bearer ${NEW_TOKEN}`)
    expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeInTheDocument()
    expect(getToken()).toBe(NEW_TOKEN)
  })

  it('updates the user of the session with the one in the response', async () => {
    accountApi((call) =>
      call.method === 'PUT' ? json(200, { token: NEW_TOKEN, user: { id: 1, username: 'ana.maria' } }) : undefined,
    )
    const user = userEvent.setup()
    await openAccount()

    await fill(user, 'vieja-clave', 'nueva-clave-1', 'nueva-clave-1')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText('Contraseña cambiada.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cuenta: ana.maria' })).toBeInTheDocument()
    expect(getToken()).toBe(NEW_TOKEN)
  })

  it.each([
    ['', 'nueva-clave-1', 'nueva-clave-1', 'Contraseña actual', 'Escribe tu contraseña actual'],
    ['vieja-clave', 'corta', 'corta', 'Contraseña nueva', 'Debe tener al menos 8 caracteres'],
    ['vieja-clave', 'nueva-clave-1', 'nueva-clave-2', 'Confirmar contraseña nueva', 'No coincide con la contraseña nueva'],
    ['vieja-clave', 'nueva-clave-1', '', 'Confirmar contraseña nueva', 'Repite la contraseña nueva'],
  ])(
    'validates in the client before calling the API (current "%s", new "%s", confirmation "%s")',
    async (current, next, confirmation, label, message) => {
      const api = accountApi()
      const user = userEvent.setup()
      await openAccount()

      await fill(user, current, next, confirmation)
      await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(message)
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
      expect(api.callsTo('PUT', '/api/auth/password')).toHaveLength(0)
      expect(screen.queryByText('Contraseña cambiada.')).not.toBeInTheDocument()
    },
  )

  it.each([
    ['currentPassword', 'La contraseña actual no es correcta', 'Contraseña actual'],
    ['newPassword', 'Debe tener al menos 8 caracteres', 'Contraseña nueva'],
  ])('shows the backend fieldError of %s next to its field, without ending the session', async (field, message, label) => {
    const api = accountApi((call) =>
      call.method === 'PUT' ? apiError(400, 'Datos inválidos', [{ field, message }]) : undefined,
    )
    const user = userEvent.setup()
    await openAccount()

    await fill(user, 'vieja-clave', 'nueva-clave-1', 'nueva-clave-1')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    const input = screen.getByLabelText(label)
    await waitFor(() => expect(input).toHaveAccessibleDescription(message))
    expect(input).toHaveFocus()
    expect(api.callsTo('PUT', '/api/auth/password')).toHaveLength(1)
    expect(screen.queryByText('Contraseña cambiada.')).not.toBeInTheDocument()
    // The generic "Datos inválidos" is redundant next to the field.
    expect(screen.queryByText('Datos inválidos')).not.toBeInTheDocument()
    expect(getToken()).toBe('valid-token')
    expect(screen.getByRole('heading', { level: 1, name: 'Cuenta' })).toBeInTheDocument()
  })

  it('shows an error that does not belong to a field and keeps what was typed', async () => {
    accountApi((call) => (call.method === 'PUT' ? apiError(500, 'Error interno del servidor') : undefined))
    const user = userEvent.setup()
    await openAccount()

    await fill(user, 'vieja-clave', 'nueva-clave-1', 'nueva-clave-1')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor')
    expect(screen.getByLabelText('Contraseña nueva')).toHaveValue('nueva-clave-1')
  })

  it('disables the form while saving', async () => {
    let release: (response: Response) => void = () => {}
    accountApi((call) =>
      call.method === 'PUT'
        ? new Promise<Response>((resolve) => {
            release = resolve
          })
        : undefined,
    )
    const user = userEvent.setup()
    await openAccount()

    await fill(user, 'vieja-clave', 'nueva-clave-1', 'nueva-clave-1')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    const form = screen.getByRole('button', { name: 'Guardando…' }).closest('form')
    if (!form) throw new Error('No form')
    expect(within(form).getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(screen.getByLabelText('Contraseña actual')).toBeDisabled()

    release(passwordChanged())
    expect(await screen.findByText('Contraseña cambiada.')).toBeInTheDocument()
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

  it.each([
    ['840', 'Demasiados intentos fallidos para este usuario. Vuelve a intentarlo en 14 minutos.'],
    [undefined, 'Demasiados intentos fallidos para este usuario. Vuelve a intentarlo en unos minutos (como máximo 15).'],
  ])('a 429 (Retry-After %s) says how long to wait, as in the login, and keeps the session', async (retryAfter, message) => {
    const api = accountApi((call) => (call.method === 'PUT' ? tooManyAttempts(retryAfter) : undefined))
    const user = userEvent.setup()
    await openAccount()

    await fill(user, 'vieja-clave', 'nueva-clave-1', 'nueva-clave-1')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(api.callsTo('PUT', '/api/auth/password')).toHaveLength(1)
    expect(screen.queryByText('Contraseña cambiada.')).not.toBeInTheDocument()
    expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeInTheDocument()
    expect(getToken()).toBe('valid-token')
    expect(screen.getByRole('heading', { level: 1, name: 'Cuenta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('vieja-clave')
  })

  it('a 401 (expired session) still sends the user to the login page', async () => {
    accountApi((call) => (call.method === 'PUT' ? apiError(401, 'Token vencido') : undefined))
    const user = userEvent.setup()
    await openAccount()

    await fill(user, 'vieja-clave', 'nueva-clave-1', 'nueva-clave-1')
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })
})
