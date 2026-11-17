import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { getToken } from '../services/tokenStorage'
import { installApi, json, renderAppAt, summary } from '../test/fakeApi'
import type { Period } from '../types/api'
import { AuthForm } from './AuthForm'

function renderForm(mode: 'login' | 'register') {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const view = render(<AuthForm mode={mode} onSubmit={onSubmit} />)
  const submitName = mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'
  return { onSubmit, submit: () => screen.getByRole('button', { name: submitName }), ...view }
}

describe('AuthForm: field attributes for browsers and password managers', () => {
  it('login uses username and current-password', () => {
    const { container } = renderForm('login')
    const username = screen.getByLabelText('Usuario')
    const password = screen.getByLabelText('Contraseña')

    expect(username).toHaveAttribute('id', 'username')
    expect(username).toHaveAttribute('name', 'username')
    expect(username).toHaveAttribute('type', 'text')
    expect(username).toHaveAttribute('autocomplete', 'username')
    expect(username).toBeRequired()

    expect(password).toHaveAttribute('id', 'current-password')
    expect(password).toHaveAttribute('name', 'current-password')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(password).toBeRequired()

    // `required` is informative: the form keeps its own validation and messages.
    expect(container.querySelector('form')).toHaveAttribute('novalidate')
  })

  it('register uses username and new-password', () => {
    const { container } = renderForm('register')
    const username = screen.getByLabelText('Usuario')
    const password = screen.getByLabelText('Contraseña')

    expect(username).toHaveAttribute('id', 'username')
    expect(username).toHaveAttribute('name', 'username')
    expect(username).toHaveAttribute('autocomplete', 'username')
    expect(username).toBeRequired()

    expect(password).toHaveAttribute('id', 'new-password')
    expect(password).toHaveAttribute('name', 'new-password')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    expect(password).toBeRequired()

    expect(container.querySelector('form')).toHaveAttribute('novalidate')
  })

  it.each(['login', 'register'] as const)('%s has exactly one username and one password field', (mode) => {
    const { container } = renderForm(mode)

    expect(container.querySelectorAll('input')).toHaveLength(2)
    expect(container.querySelectorAll('input[type=password]')).toHaveLength(1)
    expect(new Set([...container.querySelectorAll('[id]')].map((element) => element.id)).size).toBe(
      container.querySelectorAll('[id]').length,
    )
  })
})

describe('AuthForm: own validation with required fields', () => {
  it('login shows its own messages, linked to each field, instead of the browser bubbles', async () => {
    const user = userEvent.setup()
    const { onSubmit, submit } = renderForm('login')

    await user.click(submit())

    expect(screen.getByLabelText('Usuario')).toHaveAccessibleDescription('Escribe tu usuario')
    expect(screen.getByLabelText('Usuario')).toBeInvalid()
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Escribe tu contraseña')
    expect(screen.getByLabelText('Contraseña')).toBeInvalid()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('register links the password error to the new-password field', async () => {
    const user = userEvent.setup()
    const { onSubmit, submit } = renderForm('register')

    await user.type(screen.getByLabelText('Usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), '1234567')
    await user.click(submit())

    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Debe tener al menos 8 caracteres')
    expect(screen.getByLabelText('Usuario')).not.toHaveAttribute('aria-invalid')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('login does not apply the registration length rules', async () => {
    const user = userEvent.setup()
    const { onSubmit, submit } = renderForm('login')

    await user.type(screen.getByLabelText('Usuario'), 'ab')
    await user.type(screen.getByLabelText('Contraseña'), '123')
    await user.click(submit())

    expect(onSubmit).toHaveBeenCalledWith({ username: 'ab', password: '123' })
  })
})

describe('AuthForm: username ignores surrounding spaces (spec section 2, User)', () => {
  it('login sends the username without the spaces and the password untouched', async () => {
    const user = userEvent.setup()
    const { onSubmit, submit } = renderForm('login')

    await user.type(screen.getByLabelText('Usuario'), '  ana ')
    await user.type(screen.getByLabelText('Contraseña'), ' secreto 123 ')
    await user.click(submit())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({ username: 'ana', password: ' secreto 123 ' })
  })

  it('register sends the username without the spaces', async () => {
    const user = userEvent.setup()
    const { onSubmit, submit } = renderForm('register')

    await user.type(screen.getByLabelText('Usuario'), ' ana  ')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(submit())

    expect(onSubmit).toHaveBeenCalledWith({ username: 'ana', password: 'secreto-123' })
  })

  it.each(['login', 'register'] as const)('%s treats a username of only spaces as empty', async (mode) => {
    const user = userEvent.setup()
    const { onSubmit, submit } = renderForm(mode)

    await user.type(screen.getByLabelText('Usuario'), '    ')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(submit())

    expect(screen.getByLabelText('Usuario')).toHaveAccessibleDescription('Escribe tu usuario')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('register measures the length after ignoring the spaces', async () => {
    const user = userEvent.setup()
    const { onSubmit, submit } = renderForm('register')

    await user.type(screen.getByLabelText('Usuario'), '  ab  ')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(submit())

    expect(screen.getByLabelText('Usuario')).toHaveAccessibleDescription('Debe tener entre 3 y 30 caracteres')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('login accepts a 30-character username written after a space', async () => {
    const thirty = 'abcdefghijklmnopqrstuvwxyz0123'
    const user = userEvent.setup()
    const { onSubmit, submit } = renderForm('login')

    // The spaces are ignored, so they must not use up the 30 characters of the username.
    await user.type(screen.getByLabelText('Usuario'), ` ${thirty}`)
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(submit())

    expect(onSubmit).toHaveBeenCalledWith({ username: thirty, password: 'secreto-123' })
  })
})

describe('Login page: username with spaces', () => {
  it('sends the trimmed username to POST /api/auth/login and starts the session', async () => {
    const api = installApi((call) => {
      if (call.path === '/api/auth/login') return json(200, { token: 'new-token', user: { id: 7, username: 'ana' } })
      if (call.path === '/api/dashboard/summary') return json(200, summary(call.query.get('period') as Period))
      return undefined
    })
    const user = userEvent.setup()
    renderAppAt('/login', { loggedIn: false })

    await user.type(screen.getByLabelText('Usuario'), '  ana  ')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Este mes' })).toBeInTheDocument()
    expect(api.lastCallTo('POST', '/api/auth/login').body).toEqual({ username: 'ana', password: 'secreto-123' })
    expect(getToken()).toBe('new-token')
    vi.unstubAllGlobals()
  })
})
