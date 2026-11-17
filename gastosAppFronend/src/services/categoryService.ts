import type { Category, CategoryRequest } from '../types/api'
import { request } from './httpClient'

export function listCategories(): Promise<Category[]> {
  return request<Category[]>('/api/categories')
}

export function createCategory(body: CategoryRequest): Promise<Category> {
  return request<Category>('/api/categories', { method: 'POST', body })
}

export function updateCategory(id: number, body: CategoryRequest): Promise<Category> {
  return request<Category>(`/api/categories/${id}`, { method: 'PUT', body })
}

// The API has no DELETE for categories (spec section 3).
