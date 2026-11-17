import type { ReactNode } from 'react'
import { fieldErrorId } from '../utils/ids'

interface FieldProps {
  label: string
  htmlFor: string
  /** Validation message shown next to the field. */
  error?: string
  hint?: string
  children: ReactNode
}

/** Label + control + error message. The control should set `aria-describedby={fieldErrorId(id)}` when invalid. */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className={error ? 'field field-invalid' : 'field'}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" id={fieldErrorId(htmlFor)} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Errors that do not belong to a single field (conflicts, network problems, etc.). */
export function FormErrors({ messages }: { messages: readonly string[] }) {
  if (messages.length === 0) return null
  return (
    <div className="alert alert-error" role="alert">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  )
}
