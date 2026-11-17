import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Category, ExpenseFilters } from '../types/api'
import { normalizeTag } from '../utils/tags'

interface ExpenseFiltersFormProps {
  categories: readonly Category[]
  disabled?: boolean
  /** Called with only the filters that have a value. */
  onApply: (filters: ExpenseFilters) => void
}

interface Draft {
  description: string
  categoryId: string
  startDate: string
  endDate: string
  tag: string
}

const EMPTY_DRAFT: Draft = { description: '', categoryId: '', startDate: '', endDate: '', tag: '' }

function toFilters(draft: Draft): ExpenseFilters {
  const filters: ExpenseFilters = {}
  const description = draft.description.trim()
  const tag = normalizeTag(draft.tag)
  if (description !== '') filters.description = description
  if (draft.categoryId !== '') filters.categoryId = Number(draft.categoryId)
  if (draft.startDate !== '') filters.startDate = draft.startDate
  if (draft.endDate !== '') filters.endDate = draft.endDate
  if (tag !== '') filters.tag = tag
  return filters
}

export function ExpenseFiltersForm({ categories, disabled, onApply }: ExpenseFiltersFormProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [rangeError, setRangeError] = useState<string | null>(null)

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft.startDate !== '' && draft.endDate !== '' && draft.startDate > draft.endDate) {
      setRangeError('La fecha inicial no puede ser posterior a la fecha final')
      return
    }
    setRangeError(null)
    onApply(toFilters(draft))
  }

  function handleClear() {
    setDraft(EMPTY_DRAFT)
    setRangeError(null)
    onApply({})
  }

  return (
    <form className="filters card" onSubmit={handleSubmit} aria-label="Filtros de gastos" noValidate>
      <div className="filters-grid">
        <div className="field">
          <label htmlFor="filter-description">Descripción</label>
          <input
            id="filter-description"
            type="search"
            value={draft.description}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="Buscar por descripción"
          />
        </div>
        <div className="field">
          <label htmlFor="filter-category">Categoría</label>
          <select
            id="filter-category"
            value={draft.categoryId}
            onChange={(event) => update({ categoryId: event.target.value })}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-start-date">Desde</label>
          <input
            id="filter-start-date"
            type="date"
            value={draft.startDate}
            onChange={(event) => update({ startDate: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="filter-end-date">Hasta</label>
          <input
            id="filter-end-date"
            type="date"
            value={draft.endDate}
            onChange={(event) => update({ endDate: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="filter-tag">Etiqueta</label>
          <input
            id="filter-tag"
            type="text"
            value={draft.tag}
            onChange={(event) => update({ tag: event.target.value })}
            placeholder="Ej. trabajo"
          />
        </div>
      </div>
      {rangeError && (
        <p className="field-error" role="alert">
          {rangeError}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={handleClear} disabled={disabled}>
          Limpiar
        </button>
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          Filtrar
        </button>
      </div>
    </form>
  )
}
