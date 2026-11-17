import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PASSWORD_MIN_LENGTH } from '../components/AuthForm'
import { Field, FormErrors } from '../components/Field'
import { useAuth } from '../hooks/useAuth'
import { useSubmit } from '../hooks/useSubmit'
import type { PasswordChangeRequest } from '../types/api'
import { withWaitMessage } from '../utils/errors'
import type { FieldErrorMap } from '../utils/errors'
import { fieldErrorId } from '../utils/ids'

/** `confirmPassword` is only checked here; it is never sent. */
const KNOWN_FIELDS = ['currentPassword', 'newPassword', 'confirmPassword'] as const

// Stable ids and names so password managers tell the current password from the new one.
const CURRENT_ID = 'current-password'
const NEW_ID = 'new-password'
const CONFIRM_ID = 'confirm-new-password'

function validate(current: string, next: string, confirmation: string): FieldErrorMap {
  const errors: FieldErrorMap = {}
  if (current === '') errors.currentPassword = 'Escribe tu contraseña actual'
  if (next === '') {
    errors.newPassword = 'Escribe la contraseña nueva'
  } else if (next.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`
  }
  if (confirmation === '') {
    errors.confirmPassword = 'Repite la contraseña nueva'
  } else if (confirmation !== next) {
    errors.confirmPassword = 'No coincide con la contraseña nueva'
  }
  return errors
}

function invalidProps(error: string | undefined, id: string) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? fieldErrorId(id) : undefined,
  } as const
}

/**
 * Account page: change the password. The session continues after the change: the auth
 * context stores the new token the backend returns (the previous ones stop working).
 */
export function AccountPage() {
  const { user, changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changed, setChanged] = useState(false)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const { submitting, fieldErrors, generalErrors, submit, showFieldErrors, formRef } = useSubmit(KNOWN_FIELDS)

  // The submit button was disabled while saving, so the focus would be left on <body>.
  useEffect(() => {
    if (changed) noticeRef.current?.focus()
  }, [changed])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setChanged(false)
    const errors = validate(currentPassword, newPassword, confirmPassword)
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors)
      return
    }
    const body: PasswordChangeRequest = { currentPassword, newPassword }
    // A 429 (too many wrong current passwords) says how long to wait, as in the login.
    const saved = await submit(async () => {
      try {
        await changePassword(body)
      } catch (error) {
        throw withWaitMessage(error)
      }
    })
    if (saved) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setChanged(true)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Cuenta</h1>
      </header>
      {user && (
        <p className="muted">
          Usuario: <strong>{user.username}</strong>
        </p>
      )}

      <section className="card account-card" aria-labelledby="password-heading">
        <h2 id="password-heading">Cambiar contraseña</h2>
        {changed && (
          <p ref={noticeRef} className="alert alert-success" role="status" tabIndex={-1}>
            Contraseña cambiada.
          </p>
        )}
        <form ref={formRef} className="form" onSubmit={handleSubmit} noValidate>
          <FormErrors messages={generalErrors} />
          <Field label="Contraseña actual" htmlFor={CURRENT_ID} error={fieldErrors.currentPassword}>
            <input
              id={CURRENT_ID}
              name={CURRENT_ID}
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={submitting}
              {...invalidProps(fieldErrors.currentPassword, CURRENT_ID)}
            />
          </Field>
          <Field
            label="Contraseña nueva"
            htmlFor={NEW_ID}
            error={fieldErrors.newPassword}
            hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
          >
            <input
              id={NEW_ID}
              name={NEW_ID}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
              disabled={submitting}
              {...invalidProps(fieldErrors.newPassword, NEW_ID)}
            />
          </Field>
          <Field label="Confirmar contraseña nueva" htmlFor={CONFIRM_ID} error={fieldErrors.confirmPassword}>
            <input
              id={CONFIRM_ID}
              name={CONFIRM_ID}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              disabled={submitting}
              {...invalidProps(fieldErrors.confirmPassword, CONFIRM_ID)}
            />
          </Field>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </section>
    </section>
  )
}
