import { useCategories } from '../hooks/useCategories'
import { createExpense } from '../services/expenseService'
import type { ExpenseSaveResponse } from '../types/api'
import { ExpenseForm } from './ExpenseForm'
import type { ExpenseFormValues } from './ExpenseForm'
import { Modal } from './Modal'
import { EmptyState, ErrorState, Loading } from './StatusViews'

interface AddExpenseDialogProps {
  /** Called after the expense is saved; the dialog does not close itself. */
  onSaved: (response: ExpenseSaveResponse) => void
  onClose: () => void
}

/** Form to add an expense from any page; it loads the categories on its own. */
export function AddExpenseDialog({ onSaved, onClose }: AddExpenseDialogProps) {
  const { categories, error, reload } = useCategories()

  async function handleCreate(values: ExpenseFormValues) {
    const response = await createExpense({
      amount: values.amount,
      description: values.description,
      date: values.date,
      categoryId: values.categoryId,
      tags: values.tags,
    })
    onSaved(response)
  }

  return (
    <Modal title="Agregar gasto" onClose={onClose}>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !categories ? (
        <Loading label="Cargando categorías…" />
      ) : categories.length === 0 ? (
        <EmptyState title="No tienes categorías">
          <p>Crea una categoría antes de agregar un gasto.</p>
        </EmptyState>
      ) : (
        <ExpenseForm categories={categories} onSubmit={handleCreate} onCancel={onClose} />
      )}
    </Modal>
  )
}
