import { describe, expect, it } from 'vitest'
import { formatBreakdownTick, formatDate, formatMoney, parseAmount, toIsoDate } from './format'

describe('formatMoney', () => {
  it('always shows 2 decimals', () => {
    expect(formatMoney(150.5)).toBe('150.50')
    expect(formatMoney(0)).toBe('0.00')
    expect(formatMoney(4850.5)).toBe('4,850.50')
  })
})

describe('dates', () => {
  it('formats an ISO date without shifting the day', () => {
    const formatted = formatDate('2026-11-01')
    expect(formatted).toContain('2026')
    expect(formatted).toMatch(/^1 /)
  })

  it('builds an ISO date from local date parts', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('uses the day number for daily breakdown points', () => {
    expect(formatBreakdownTick('2026-11-09')).toBe('9')
  })
})

describe('parseAmount', () => {
  it('accepts up to 2 decimals', () => {
    expect(parseAmount('150.50')).toBe(150.5)
    expect(parseAmount(' 20 ')).toBe(20)
  })

  it('rejects invalid amounts', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('1.234')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
  })
})
