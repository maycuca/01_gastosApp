import type { DashboardSummary, Period } from '../types/api'
import { request } from './httpClient'

export function getDashboardSummary(period: Period): Promise<DashboardSummary> {
  return request<DashboardSummary>('/api/dashboard/summary', { query: { period } })
}
