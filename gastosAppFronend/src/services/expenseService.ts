import type {
  Expense,
  ExpenseCreateRequest,
  ExpenseListParams,
  ExpenseSaveResponse,
  ExpenseUpdateRequest,
  Page,
} from '../types/api'
import { request } from './httpClient'

export const DEFAULT_PAGE_SIZE = 20

export function listExpenses(params: ExpenseListParams = {}): Promise<Page<Expense>> {
  return request<Page<Expense>>('/api/expenses', {
    query: {
      description: params.description,
      categoryId: params.categoryId,
      startDate: params.startDate,
      endDate: params.endDate,
      tag: params.tag,
      page: params.page,
      size: params.size,
    },
  })
}

export function getExpense(id: number): Promise<Expense> {
  return request<Expense>(`/api/expenses/${id}`)
}

export function createExpense(body: ExpenseCreateRequest): Promise<ExpenseSaveResponse> {
  return request<ExpenseSaveResponse>('/api/expenses', { method: 'POST', body })
}

export function updateExpense(id: number, body: ExpenseUpdateRequest): Promise<ExpenseSaveResponse> {
  return request<ExpenseSaveResponse>(`/api/expenses/${id}`, { method: 'PUT', body })
}

export function deleteExpense(id: number): Promise<void> {
  return request<void>(`/api/expenses/${id}`, { method: 'DELETE' })
}
