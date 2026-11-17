import { useCallback } from 'react'
import * as expenseService from '../services/expenseService'
import type {
  Expense,
  ExpenseCreateRequest,
  ExpenseFilters,
  ExpenseSaveResponse,
  ExpenseUpdateRequest,
  Page,
} from '../types/api'
import { useAsyncData } from './useAsyncData'

export interface UseExpenses {
  page: Page<Expense> | null
  loading: boolean
  error: string | null
  reload: () => void
  createExpense: (body: ExpenseCreateRequest) => Promise<ExpenseSaveResponse>
  updateExpense: (id: number, body: ExpenseUpdateRequest) => Promise<ExpenseSaveResponse>
  deleteExpense: (id: number) => Promise<void>
}

/**
 * Paginated, filtered list of expenses plus its mutations.
 * @param filters must be a stable object (keep it in state); a new identity triggers a reload.
 */
export function useExpenses(filters: ExpenseFilters, pageNumber: number): UseExpenses {
  const loader = useCallback(
    () => expenseService.listExpenses({ ...filters, page: pageNumber, size: expenseService.DEFAULT_PAGE_SIZE }),
    [filters, pageNumber],
  )
  const { data, loading, error, reload } = useAsyncData(loader)

  const createExpense = useCallback(
    async (body: ExpenseCreateRequest) => {
      const saved = await expenseService.createExpense(body)
      reload()
      return saved
    },
    [reload],
  )

  const updateExpense = useCallback(
    async (id: number, body: ExpenseUpdateRequest) => {
      const saved = await expenseService.updateExpense(id, body)
      reload()
      return saved
    },
    [reload],
  )

  const deleteExpense = useCallback(
    async (id: number) => {
      await expenseService.deleteExpense(id)
      reload()
    },
    [reload],
  )

  return { page: data, loading, error, reload, createExpense, updateExpense, deleteExpense }
}
