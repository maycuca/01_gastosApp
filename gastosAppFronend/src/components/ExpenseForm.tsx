import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSubmit } from '../hooks/useSubmit'
import type { Category, Expense, IsoDate } from '../types/api'
import type { FieldErrorMap } from '../utils/errors'
import { amountToInput, formatDate, parseAmount, todayIsoDate } from '../utils/format'
import { MAX_TAG_LENGTH, MAX_TAGS, mergeTags } from '../utils/tags'
import { fieldErrorId } from '../utils/ids'
import { Field, FormErrors } from './Field'
import { TagInput } from './TagInput'

const KNOWN_FIELDS = ['amount', 'description', 'date', 'categoryId', 'tags'] as const

export const DESCRIPTION_MAX_LENGTH = 255

export interface ExpenseFormValues {
  amount: number
  description: string
  /** Chosen date on creation; the unchanged original date on edition (never sent on update). */
  date: IsoDate
  categoryId: number
  tags: string[]
}

interface ExpenseFormProps {
  /** When present the form edits this expense; otherwise it creates one. */
  expense?: Expense
  categories: readonly Category[]
  /** Must reject with the API error so `fieldErrors` can be shown next to each field. */
  onSubmit: (values: ExpenseFormValues) => Promise<void>
  onCancel: () => void
}

export function ExpenseForm({ expense, categories, onSubmit, onCancel }: ExpenseFormProps) {
  const isEdit = expense !== undefined
  const [amount, setAmount] = useState(expense ? amountToInput(expense.amount) : '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [date, setDate] = useState<IsoDate>(expense?.date ?? todayIsoDate())
  const [categoryId, setCategoryId] = useState(expense ? String(expense.category.id) : '')
  const [tags, setTags] = useState<string[]>(expense?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const { submitting, fieldErrors, generalErrors, submit, showFieldErrors, formRef } = useSubmit(KNOWN_FIELDS)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: FieldErrorMap = {}

    const parsedAmount = parseAmount(amount)
    if (amount.trim() === '') errors.amount = 'Escribe el monto'
    else if (parsedAmount === null) errors.amount = 'Escribe un número con máximo 2 decimales'
    else if (parsedAmount <= 0) errors.amount = 'Debe ser mayor a 0'

    const trimmedDescription = description.trim()
    if (trimmedDescription === '') errors.description = 'Escribe una descripción'
    else if (trimmedDescription.length > DESCRIPTION_MAX_LENGTH) {
      errors.description = `Máximo ${DESCRIPTION_MAX_LENGTH} caracteres`
    }

    if (!isEdit) {
      if (date === '') errors.date = 'Elige la fecha'
      else if (date > todayIsoDate()) errors.date = 'La fecha no puede ser futura'
    }

    if (categoryId === '') errors.categoryId = 'Elige una categoría'

    // Text still in the tag box counts as a tag.
    const allTags = mergeTags(tags, tagDraft)
    if (allTags.length > MAX_TAGS) errors.tags = `Máximo ${MAX_TAGS} etiquetas`
    else if (allTags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
      errors.tags = `Cada etiqueta puede tener máximo ${MAX_TAG_LENGTH} caracteres`
    }

    if (Object.keys(errors).length > 0 || parsedAmount === null) {
      showFieldErrors(errors)
      return
    }

    setTags(allTags)
    setTagDraft('')
    await submit(() =>
      onSubmit({
        amount: parsedAmount,
        description: trimmedDescription,
        date,
        categoryId: Number(categoryId),
        tags: allTags,
      }),
    )
  }

  return (
    <form ref={formRef} className="form" onSubmit={handleSubmit} noValidate>
      <FormErrors messages={generalErrors} />

      <Field label="Monto" htmlFor="expense-amount" error={fieldErrors.amount}>
        <input
          id="expense-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          autoComplete="off"
          autoFocus
          disabled={submitting}
          aria-invalid={fieldErrors.amount ? true : undefined}
          aria-describedby={fieldErrors.amount ? fieldErrorId('expense-amount') : undefined}
        />
      </Field>

      <Field label="Descripción" htmlFor="expense-description" error={fieldErrors.description}>
        <input
          id="expense-description"
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={DESCRIPTION_MAX_LENGTH}
          disabled={submitting}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={fieldErrors.description ? fieldErrorId('expense-description') : undefined}
        />
      </Field>

      {isEdit ? (
        <Field
          label="Fecha"
          htmlFor="expense-date"
          error={fieldErrors.date}
          hint="La fecha no se puede cambiar después de crear el gasto."
        >
          <input id="expense-date" type="text" value={formatDate(date)} readOnly aria-readonly="true" />
        </Field>
      ) : (
        <Field label="Fecha" htmlFor="expense-date" error={fieldErrors.date}>
          <input
            id="expense-date"
            type="date"
            value={date}
            max={todayIsoDate()}
            onChange={(event) => setDate(event.target.value)}
            disabled={submitting}
            aria-invalid={fieldErrors.date ? true : undefined}
            aria-describedby={fieldErrors.date ? fieldErrorId('expense-date') : undefined}
          />
        </Field>
      )}

      <Field label="Categoría" htmlFor="expense-category" error={fieldErrors.categoryId}>
        <select
          id="expense-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          disabled={submitting}
          aria-invalid={fieldErrors.categoryId ? true : undefined}
          aria-describedby={fieldErrors.categoryId ? fieldErrorId('expense-category') : undefined}
        >
          <option value="">Selecciona una categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Etiquetas (opcional)" htmlFor="expense-tags" error={fieldErrors.tags}>
        <TagInput
          id="expense-tags"
          tags={tags}
          onTagsChange={setTags}
          draft={tagDraft}
          onDraftChange={setTagDraft}
          disabled={submitting}
          describedBy={fieldErrors.tags ? fieldErrorId('expense-tags') : undefined}
        />
      </Field>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar gasto'}
        </button>
      </div>
    </form>
  )
}
