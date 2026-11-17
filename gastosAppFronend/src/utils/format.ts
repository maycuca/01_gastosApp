import type { IsoDate } from '../types/api'

const LOCALE = 'es-MX'

const moneyFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })
const monthFormatter = new Intl.DateTimeFormat(LOCALE, { month: 'short' })
const monthYearFormatter = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_MONTH = /^(\d{4})-(\d{2})$/

/** Amount with exactly 2 decimals. The app has a single currency and no symbol (spec section 1). */
export function formatMoney(amount: number): string {
  return moneyFormatter.format(amount)
}

export function formatPercentage(value: number): string {
  return `${percentFormatter.format(value)}%`
}

/** Parses `YYYY-MM-DD` as a local date (avoids the UTC shift of `new Date(string)`). */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** `2026-11-15` -> `15 nov 2026`. Returns the input untouched if it is not an ISO date. */
export function formatDate(value: IsoDate): string {
  const date = parseIsoDate(value)
  return date ? dateFormatter.format(date) : value
}

export function toIsoDate(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayIsoDate(): IsoDate {
  return toIsoDate(new Date())
}

/** Short axis label for a breakdown point: day of month for dates, month name for `YYYY-MM`. */
export function formatBreakdownTick(label: string): string {
  const date = parseIsoDate(label)
  if (date) return String(date.getDate())
  const month = ISO_MONTH.exec(label)
  if (month) return monthFormatter.format(new Date(Number(month[1]), Number(month[2]) - 1, 1))
  return label
}

/** Full label for a breakdown point, used in tooltips. */
export function formatBreakdownLabel(label: string): string {
  const date = parseIsoDate(label)
  if (date) return dateFormatter.format(date)
  const month = ISO_MONTH.exec(label)
  if (month) return monthYearFormatter.format(new Date(Number(month[1]), Number(month[2]) - 1, 1))
  return label
}

const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/

/**
 * Parses a user-typed amount with at most 2 decimals. Returns `null` when the text
 * is not a valid amount (letters, more than 2 decimals, empty).
 */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim()
  if (!AMOUNT_PATTERN.test(trimmed)) return null
  const value = Number(trimmed.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

/** Value for an amount input: no thousands separator, 2 decimals. */
export function amountToInput(amount: number): string {
  return amount.toFixed(2)
}
