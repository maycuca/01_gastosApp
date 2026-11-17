import { useCallback } from 'react'
import * as categoryService from '../services/categoryService'
import type { Category, CategoryRequest } from '../types/api'
import { useAsyncData } from './useAsyncData'

export interface UseCategories {
  categories: Category[] | null
  loading: boolean
  error: string | null
  reload: () => void
  createCategory: (body: CategoryRequest) => Promise<Category>
  updateCategory: (id: number, body: CategoryRequest) => Promise<Category>
}

export function useCategories(): UseCategories {
  const { data, loading, error, reload } = useAsyncData(categoryService.listCategories)

  const createCategory = useCallback(
    async (body: CategoryRequest) => {
      const created = await categoryService.createCategory(body)
      reload()
      return created
    },
    [reload],
  )

  const updateCategory = useCallback(
    async (id: number, body: CategoryRequest) => {
      const updated = await categoryService.updateCategory(id, body)
      reload()
      return updated
    },
    [reload],
  )

  return { categories: data, loading, error, reload, createCategory, updateCategory }
}
