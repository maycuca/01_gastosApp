import type { LimitRequest, LimitStatus, Period } from '../types/api'
import { request } from './httpClient'

export function listLimits(): Promise<LimitStatus[]> {
  return request<LimitStatus[]>('/api/limits')
}

export function setLimit(period: Period, body: LimitRequest): Promise<LimitStatus> {
  return request<LimitStatus>(`/api/limits/${period}`, { method: 'PUT', body })
}

export function deleteLimit(period: Period): Promise<void> {
  return request<void>(`/api/limits/${period}`, { method: 'DELETE' })
}
