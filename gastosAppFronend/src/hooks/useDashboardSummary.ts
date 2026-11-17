import { useCallback } from 'react'
import { getDashboardSummary } from '../services/dashboardService'
import type { DashboardSummary, Period } from '../types/api'
import { useAsyncData } from './useAsyncData'

export interface UseDashboardSummary {
  /** Summary of the requested period; `null` while it loads or after an error. */
  summary: DashboardSummary | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useDashboardSummary(period: Period): UseDashboardSummary {
  const loader = useCallback(() => getDashboardSummary(period), [period])
  const { data, loading, error, reload } = useAsyncData(loader)
  // While a new tab loads, the previous tab's data must not be shown under the new one.
  const summary = data && data.period === period ? data : null
  return { summary, loading, error, reload }
}
