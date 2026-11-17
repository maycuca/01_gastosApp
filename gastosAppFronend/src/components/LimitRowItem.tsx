import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LimitRow } from '../hooks/useLimits'
import { useSubmit } from '../hooks/useSubmit'
import type { Period } from '../types/api'
import { amountToInput, formatMoney, parseAmount } from '../utils/format'
import { periodLabel } from '../utils/periods'
import { fieldErrorId, limitHeadingId } from '../utils/ids'
import { FormErrors } from './Field'

const KNOWN_FIELDS = ['limitAmount'] as const

interface LimitRowItemProps {
  row: LimitRow
  disabled?: boolean
  /** Must reject with the API error so it can be shown in the row. */
  onSave: (period: Period, limitAmount: number) => Promise<void>
  onRemove: (period: Period) => void
}

/** One period: spent, limit and remaining, plus the controls to set, change or remove the limit. */
export function LimitRowItem({ row, disabled, onSave, onRemove }: LimitRowItemProps) {
  const { period, limit, spent } = row
  const label = periodLabel(period)
  const inputId = `limit-${period}`
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const { submitting, fieldErrors, generalErrors, submit, showFieldErrors, reset, formRef } = useSubmit(KNOWN_FIELDS)
  const rowRef = useRef<HTMLLIElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  /** Where the focus goes once the inline form is gone (it held the focus). */
  const focusAfterClose = useRef<'heading' | 'toggle' | null>(null)

  // After saving, "Cambiar" stays disabled while the list reloads, so the focus goes to the
  // heading of this row (as after removing a limit). After cancelling, it returns to the
  // button that opened the form. An effect, so it runs once the form has been removed.
  useEffect(() => {
    if (editing || focusAfterClose.current === null) return
    const target = focusAfterClose.current === 'heading' ? headingRef.current : toggleRef.current
    focusAfterClose.current = null
    // Only when the focus was lost with the form: never take it from where the user moved it.
    const active = document.activeElement
    const lost = active === null || active === document.body || (rowRef.current?.contains(active) ?? false)
    if (lost) target?.focus()
  }, [editing])

  function closeForm(focusTarget: 'heading' | 'toggle') {
    focusAfterClose.current = focusTarget
    setEditing(false)
  }

  function startEditing() {
    setAmount(limit ? amountToInput(limit.limitAmount) : '')
    reset()
    setEditing(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseAmount(amount)
    if (parsed === null) {
      showFieldErrors({ limitAmount: 'Escribe un número con máximo 2 decimales' })
      return
    }
    if (parsed <= 0) {
      showFieldErrors({ limitAmount: 'Debe ser mayor a 0' })
      return
    }
    const saved = await submit(() => onSave(period, parsed))
    if (saved) closeForm('heading')
  }

  const exceeded = limit?.exceeded === true

  return (
    <li ref={rowRef} className={exceeded ? 'limit-row limit-row-exceeded' : 'limit-row'}>
      <div className="limit-row-main">
        <h2 ref={headingRef} className="limit-period" id={limitHeadingId(period)} tabIndex={-1}>
          {label}
          {exceeded && <span className="badge badge-danger">Excedido</span>}
        </h2>
        <dl className="limit-figures">
          <div>
            <dt>Gastado</dt>
            <dd className={exceeded ? 'text-danger' : undefined}>{spent === null ? '—' : formatMoney(spent)}</dd>
          </div>
          <div>
            <dt>Límite</dt>
            <dd>{limit ? formatMoney(limit.limitAmount) : <span className="muted">Sin límite</span>}</dd>
          </div>
          <div>
            <dt>Restante</dt>
            <dd className={limit && limit.remaining < 0 ? 'text-danger' : undefined}>
              {limit ? formatMoney(limit.remaining) : '—'}
            </dd>
          </div>
        </dl>
      </div>

      {editing ? (
        <form ref={formRef} className="limit-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor={inputId}>Límite para {label}</label>
          <div className="limit-form-row">
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              autoComplete="off"
              autoFocus
              disabled={submitting}
              aria-invalid={fieldErrors.limitAmount ? true : undefined}
              aria-describedby={fieldErrors.limitAmount ? fieldErrorId(inputId) : undefined}
            />
            <button type="submit" className="btn btn-primary btn-small" disabled={submitting}>
              {submitting ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="btn btn-small" onClick={() => closeForm('toggle')} disabled={submitting}>
              Cancelar
            </button>
          </div>
          {fieldErrors.limitAmount && (
            <p className="field-error" id={fieldErrorId(inputId)} role="alert">
              {fieldErrors.limitAmount}
            </p>
          )}
          <FormErrors messages={generalErrors} />
        </form>
      ) : (
        <div className="row-actions">
          <button
            ref={toggleRef}
            type="button"
            className="btn btn-small"
            onClick={startEditing}
            disabled={disabled}
            aria-label={`${limit ? 'Cambiar' : 'Fijar'} límite de ${label}`}
          >
            {limit ? 'Cambiar' : 'Fijar límite'}
          </button>
          {limit && (
            <button
              type="button"
              className="btn btn-small btn-danger-outline"
              onClick={() => onRemove(period)}
              disabled={disabled}
              aria-label={`Quitar límite de ${label}`}
            >
              Quitar
            </button>
          )}
        </div>
      )}
    </li>
  )
}
