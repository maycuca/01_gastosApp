import { useCallback } from 'react'
import { getDashboardSummary } from '../services/dashboardService'
import * as limitService from '../services/limitService'
import type { LimitStatus, Period } from '../types/api'
import { PERIODS } from '../utils/periods'
import { useAsyncData } from './useAsyncData'

/** One row of the limits page: every period has a row, with or without a limit. */
export interface LimitRow {
  period: Period
  /** `null` when the user has no limit for the period. */
  limit: LimitStatus | null
  /** Spent in the current period; `null` when it could not be obtained. */
  spent: number | null
}

export interface UseLimits {
  rows: LimitRow[] | null
  loading: boolean
  error: string | null
  reload: () => void
  setLimit: (period: Period, limitAmount: number) => Promise<void>
  removeLimit: (period: Period) => Promise<void>
}

/**
 * `GET /api/limits` only describes limits that exist. For the periods without a
 * limit, the amount spent comes from `totalSpent` of the dashboard summary of that
 * period (same current calendar period); if that call fails the row shows no amount.
 */
async function loadLimitRows(): Promise<LimitRow[]> {
  const limits = await limitService.listLimits()
  const byPeriod = new Map<Period, LimitStatus>()
  for (const limit of limits) byPeriod.set(limit.period, limit)

  const missing = PERIODS.filter((period) => !byPeriod.has(period))
  const summaries = await Promise.allSettled(missing.map((period) => getDashboardSummary(period)))
  const spentWithoutLimit = new Map<Period, number>()
  summaries.forEach((result, index) => {
    if (result.status === 'fulfilled') spentWithoutLimit.set(missing[index], result.value.totalSpent)
  })

  return PERIODS.map((period) => {
    const limit = byPeriod.get(period) ?? null
    return {
      period,
      limit,
      spent: limit ? limit.spent : (spentWithoutLimit.get(period) ?? null),
    }
  })
}

export function useLimits(): UseLimits {
  const { data, loading, error, reload } = useAsyncData(loadLimitRows)

  const setLimit = useCallback(
    async (period: Period, limitAmount: number) => {
      await limitService.setLimit(period, { limitAmount })
      reload()
    },
    [reload],
  )

  const removeLimit = useCallback(
    async (period: Period) => {
      await limitService.deleteLimit(period)
      reload()
    },
    [reload],
  )

  return { rows: data, loading, error, reload, setLimit, removeLimit }
}
