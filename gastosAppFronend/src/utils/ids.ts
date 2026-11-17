import type { Period } from '../types/api'

/** Id of the error message of a form control, for `aria-describedby`. */
export function fieldErrorId(inputId: string): string {
  return `${inputId}-error`
}

/** Id of the heading of a period row in the limits page; it receives the focus after its limit is removed. */
export function limitHeadingId(period: Period): string {
  return `limit-heading-${period}`
}

export const DASHBOARD_PANEL_ID = 'dashboard-panel'

export function periodTabId(period: Period): string {
  return `dashboard-tab-${period}`
}
