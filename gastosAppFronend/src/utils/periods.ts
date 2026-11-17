import type { Period } from '../types/api'

export const PERIODS: readonly Period[] = ['DAY', 'WEEK', 'FORTNIGHT', 'MONTH', 'YEAR']

export const DEFAULT_PERIOD: Period = 'MONTH'

export const PERIOD_LABELS: Record<Period, string> = {
  DAY: 'Día',
  WEEK: 'Semana',
  FORTNIGHT: 'Quincena',
  MONTH: 'Mes',
  YEAR: 'Año',
}

/** Title of the dashboard for the period in progress. */
export const CURRENT_PERIOD_TITLES: Record<Period, string> = {
  DAY: 'Hoy',
  WEEK: 'Esta semana',
  FORTNIGHT: 'Esta quincena',
  MONTH: 'Este mes',
  YEAR: 'Este año',
}

/** Names the previous period, to label its total. */
export const PREVIOUS_PERIOD_LABELS: Record<Period, string> = {
  DAY: 'Ayer',
  WEEK: 'Semana pasada',
  FORTNIGHT: 'Quincena pasada',
  MONTH: 'Mes pasado',
  YEAR: 'Año pasado',
}

/** Ends a sentence that compares against the previous period ("Subió 10.00 frente al mes pasado"). */
export const COMPARED_TO_PREVIOUS: Record<Period, string> = {
  DAY: 'frente a ayer',
  WEEK: 'frente a la semana pasada',
  FORTNIGHT: 'frente a la quincena pasada',
  MONTH: 'frente al mes pasado',
  YEAR: 'frente al año pasado',
}

export function periodLabel(period: Period): string {
  return PERIOD_LABELS[period]
}
