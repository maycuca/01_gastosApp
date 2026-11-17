import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSubmit } from '../hooks/useSubmit'
import type { AuthRequest } from '../types/api'
import type { FieldErrorMap } from '../utils/errors'
import { fieldErrorId } from '../utils/ids'
import { Field, FormErrors } from './Field'

const KNOWN_FIELDS = ['username', 'password'] as const

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30
export const PASSWORD_MIN_LENGTH = 8

interface AuthFormProps {
  mode: 'login' | 'register'
  /** Must reject with the API error so it can be shown in the form. */
  onSubmit: (credentials: AuthRequest) => Promise<void>
}

function validate(mode: AuthFormProps['mode'], username: string, password: string): FieldErrorMap {
  const errors: FieldErrorMap = {}
  if (username === '') {
    errors.username = 'Escribe tu usuario'
  } else if (mode === 'register' && (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH)) {
    errors.username = `Debe tener entre ${USERNAME_MIN_LENGTH} y ${USERNAME_MAX_LENGTH} caracteres`
  }
  if (password === '') {
    errors.password = 'Escribe tu contraseña'
  } else if (mode === 'register' && password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`
  }
  return errors
}

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { submitting, fieldErrors, generalErrors, submit, showFieldErrors, formRef } = useSubmit(KNOWN_FIELDS)
  const isRegister = mode === 'register'
  const passwordId = isRegister ? 'new-password' : 'current-password'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // No `maxLength` on the field: the limit applies to the trimmed value, and the attribute
    // would also count the spaces around it.
    const credentials: AuthRequest = { username: username.trim(), password }
    const errors = validate(mode, credentials.username, credentials.password)
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors)
      return
    }
    await submit(() => onSubmit(credentials))
  }

  return (
    <form ref={formRef} className="form" onSubmit={handleSubmit} noValidate>
      <FormErrors messages={generalErrors} />
      <Field
        label="Usuario"
        htmlFor="username"
        error={fieldErrors.username}
        hint={isRegister ? `Entre ${USERNAME_MIN_LENGTH} y ${USERNAME_MAX_LENGTH} caracteres` : undefined}
      >
        <input
          id="username"
          name="username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={submitting}
          aria-invalid={fieldErrors.username ? true : undefined}
          aria-describedby={fieldErrors.username ? fieldErrorId('username') : undefined}
        />
      </Field>
      <Field
        label="Contraseña"
        htmlFor={passwordId}
        error={fieldErrors.password}
        hint={isRegister ? `Mínimo ${PASSWORD_MIN_LENGTH} caracteres` : undefined}
      >
        {/* Stable id, name and autocomplete let password managers tell a new password from the current one. */}
        <input
          id={passwordId}
          name={passwordId}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={passwordId}
          required
          disabled={submitting}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? fieldErrorId(passwordId) : undefined}
        />
      </Field>
      <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
        {submitting ? 'Enviando…' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
      </button>
    </form>
  )
}
