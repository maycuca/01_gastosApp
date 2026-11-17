import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSubmit } from '../hooks/useSubmit'
import type { Category, CategoryRequest } from '../types/api'
import type { FieldErrorMap } from '../utils/errors'
import { fieldErrorId } from '../utils/ids'
import { Field, FormErrors } from './Field'

const KNOWN_FIELDS = ['name', 'color'] as const

export const CATEGORY_NAME_MAX_LENGTH = 50
const DEFAULT_COLOR = '#2563EB'
const COLOR_PATTERN = /^#[0-9A-F]{6}$/

interface CategoryFormProps {
  /** When present the form edits this category; otherwise it creates one. */
  category?: Category
  /** Must reject with the API error so it can be shown in the form. */
  onSubmit: (body: CategoryRequest) => Promise<void>
  onCancel: () => void
}

export function CategoryForm({ category, onSubmit, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '')
  // The spec's color format is #RRGGBB; the native picker reports lowercase, so it is normalized.
  const [color, setColor] = useState((category?.color ?? DEFAULT_COLOR).toUpperCase())
  const { submitting, fieldErrors, generalErrors, submit, showFieldErrors, formRef } = useSubmit(KNOWN_FIELDS)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: FieldErrorMap = {}
    const trimmedName = name.trim()
    if (trimmedName === '') errors.name = 'Escribe el nombre'
    else if (trimmedName.length > CATEGORY_NAME_MAX_LENGTH) {
      errors.name = `Máximo ${CATEGORY_NAME_MAX_LENGTH} caracteres`
    }
    if (!COLOR_PATTERN.test(color)) errors.color = 'Elige un color válido'
    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors)
      return
    }
    await submit(() => onSubmit({ name: trimmedName, color }))
  }

  return (
    <form ref={formRef} className="form" onSubmit={handleSubmit} noValidate>
      <FormErrors messages={generalErrors} />
      <Field label="Nombre" htmlFor="category-name" error={fieldErrors.name}>
        <input
          id="category-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={CATEGORY_NAME_MAX_LENGTH}
          disabled={submitting}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? fieldErrorId('category-name') : undefined}
        />
      </Field>
      <Field label="Color" htmlFor="category-color" error={fieldErrors.color}>
        <div className="color-picker">
          <input
            id="category-color"
            type="color"
            value={color.toLowerCase()}
            onChange={(event) => setColor(event.target.value.toUpperCase())}
            disabled={submitting}
            aria-invalid={fieldErrors.color ? true : undefined}
            aria-describedby={fieldErrors.color ? fieldErrorId('category-color') : undefined}
          />
          <code>{color}</code>
        </div>
      </Field>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : category ? 'Guardar cambios' : 'Crear categoría'}
        </button>
      </div>
    </form>
  )
}
