import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ExceededLimitsAlert } from '../components/ExceededLimitsAlert'
import { ExpenseFiltersForm } from '../components/ExpenseFiltersForm'
import { ExpenseForm } from '../components/ExpenseForm'
import type { ExpenseFormValues } from '../components/ExpenseForm'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, Loading } from '../components/StatusViews'
import { useCategories } from '../hooks/useCategories'
import { useExpenses } from '../hooks/useExpenses'
import type { ExceededLimit, Expense, ExpenseFilters, ExpenseSaveResponse } from '../types/api'
import { formatDate, formatMoney } from '../utils/format'

type Dialog = { kind: 'create' } | { kind: 'edit'; expense: Expense } | { kind: 'delete'; expense: Expense }

interface Notice {
  message: string
  exceededLimits: ExceededLimit[]
}

const NO_FILTERS: ExpenseFilters = {}

export function ExpensesPage() {
  const [filters, setFilters] = useState<ExpenseFilters>(NO_FILTERS)
  const [pageNumber, setPageNumber] = useState(0)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const categoriesState = useCategories()
  const { page, loading, error, reload, createExpense, updateExpense, deleteExpense } = useExpenses(
    filters,
    pageNumber,
  )

  const closeDialog = useCallback(() => setDialog(null), [])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusHeadingOnClose = useRef(false)

  // After a delete the button that opened the confirmation disappears with its row, so the
  // focus goes to the page title. This runs after the dialog returned the focus to that button.
  useEffect(() => {
    if (dialog === null && focusHeadingOnClose.current) {
      focusHeadingOnClose.current = false
      headingRef.current?.focus()
    }
  }, [dialog])

  /** Closes `opened` only if it is still the open dialog, so a late answer never closes another one. */
  function closeIfStill(opened: Dialog | null) {
    setDialog((current) => (current === opened ? null : current))
  }
  const hasFilters = Object.keys(filters).length > 0

  function handleApplyFilters(next: ExpenseFilters) {
    setFilters(next)
    setPageNumber(0)
  }

  function handleSaved(message: string, response: ExpenseSaveResponse) {
    // Each save replaces the previous alert, so it disappears when no limit is exceeded any more.
    setNotice({ message, exceededLimits: response.exceededLimits })
    closeIfStill(dialog)
  }

  async function handleCreate(values: ExpenseFormValues) {
    const response = await createExpense({
      amount: values.amount,
      description: values.description,
      date: values.date,
      categoryId: values.categoryId,
      tags: values.tags,
    })
    handleSaved('Gasto agregado.', response)
  }

  async function handleUpdate(expense: Expense, values: ExpenseFormValues) {
    // The date is immutable: it is not part of the update body.
    const response = await updateExpense(expense.id, {
      amount: values.amount,
      description: values.description,
      categoryId: values.categoryId,
      tags: values.tags,
    })
    handleSaved('Gasto actualizado.', response)
  }

  async function handleDelete(expense: Expense) {
    await deleteExpense(expense.id)
    setNotice({ message: 'Gasto eliminado.', exceededLimits: [] })
    focusHeadingOnClose.current = true
    closeIfStill(dialog)
    // Deleting the only row of a page other than the first would leave an empty page.
    if (page && page.content.length === 1 && pageNumber > 0) {
      setPageNumber(pageNumber - 1)
    }
  }

  const categories = categoriesState.categories

  return (
    <section className="page">
      <header className="page-header">
        <h1 ref={headingRef} tabIndex={-1}>
          Gastos
        </h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setDialog({ kind: 'create' })}
          disabled={!categories}
        >
          Agregar gasto
        </button>
      </header>

      {notice && (
        <>
          <p className="alert alert-success" role="status">
            {notice.message}
          </p>
          <ExceededLimitsAlert
            exceededLimits={notice.exceededLimits}
            onDismiss={() => setNotice({ message: notice.message, exceededLimits: [] })}
          />
        </>
      )}

      {categoriesState.error && <ErrorState message={categoriesState.error} onRetry={categoriesState.reload} />}

      <ExpenseFiltersForm categories={categories ?? []} disabled={loading} onApply={handleApplyFilters} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !page ? (
        <Loading label="Cargando gastos…" />
      ) : page.content.length === 0 ? (
        <EmptyState title={hasFilters ? 'Ningún gasto coincide con los filtros' : 'Aún no tienes gastos'}>
          <p>
            {hasFilters
              ? 'Prueba con otros filtros o límpialos para ver todos tus gastos.'
              : 'Registra tu primer gasto con el botón "Agregar gasto".'}
          </p>
        </EmptyState>
      ) : (
        <div className={loading ? 'card is-refreshing' : 'card'} aria-busy={loading}>
          <table className="table responsive-table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Descripción</th>
                <th scope="col">Categoría</th>
                <th scope="col">Etiquetas</th>
                <th scope="col" className="numeric">
                  Monto
                </th>
                <th scope="col">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.content.map((expense) => (
                <tr key={expense.id}>
                  <td data-label="Fecha">{formatDate(expense.date)}</td>
                  <td data-label="Descripción">{expense.description}</td>
                  <td data-label="Categoría">
                    <span className="category-chip">
                      <span
                        className="color-dot"
                        style={{ backgroundColor: expense.category.color }}
                        aria-hidden="true"
                      />
                      {expense.category.name}
                    </span>
                  </td>
                  <td data-label="Etiquetas">
                    {expense.tags.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <ul className="tag-list">
                        {expense.tags.map((tag) => (
                          <li key={tag} className="tag">
                            {tag}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Monto" className="numeric amount">
                    {formatMoney(expense.amount)}
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => setDialog({ kind: 'edit', expense })}
                      disabled={!categories}
                      aria-label={`Editar ${expense.description}`}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger-outline"
                      onClick={() => setDialog({ kind: 'delete', expense })}
                      aria-label={`Eliminar ${expense.description}`}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            page={page.page}
            totalPages={page.totalPages}
            totalElements={page.totalElements}
            disabled={loading}
            onPageChange={setPageNumber}
          />
        </div>
      )}

      {dialog?.kind === 'create' && categories && (
        <Modal title="Agregar gasto" onClose={closeDialog}>
          {categories.length === 0 ? (
            <EmptyState title="No tienes categorías">
              <p>Crea una categoría antes de registrar un gasto.</p>
            </EmptyState>
          ) : (
            <ExpenseForm categories={categories} onSubmit={handleCreate} onCancel={closeDialog} />
          )}
        </Modal>
      )}

      {dialog?.kind === 'edit' && categories && (
        <Modal title="Editar gasto" onClose={closeDialog}>
          <ExpenseForm
            expense={dialog.expense}
            categories={categories}
            onSubmit={(values) => handleUpdate(dialog.expense, values)}
            onCancel={closeDialog}
          />
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Eliminar gasto"
          confirmLabel="Eliminar"
          onConfirm={() => handleDelete(dialog.expense)}
          onCancel={closeDialog}
        >
          <p>
            ¿Eliminar el gasto <strong>{dialog.expense.description}</strong> por{' '}
            <strong>{formatMoney(dialog.expense.amount)}</strong> del {formatDate(dialog.expense.date)}?
          </p>
          <p>Esta acción es definitiva.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
