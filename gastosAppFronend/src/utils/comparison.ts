/** `none` means there is no previous data to compare against (`changePercentage` is null). */
export type ChangeDirection = 'up' | 'down' | 'same' | 'none'

export interface PeriodChange {
  direction: ChangeDirection
  /** Absolute difference between the current and the previous total. */
  difference: number
  /** Absolute change percentage reported by the API; `null` when there is no previous data. */
  percentage: number | null
}

/** Describes how the current period compares with the previous one. */
export function describeChange(
  totalSpent: number,
  previousTotal: number,
  changePercentage: number | null,
): PeriodChange {
  const difference = Math.round((totalSpent - previousTotal) * 100) / 100
  if (changePercentage === null) {
    return { direction: 'none', difference: Math.abs(difference), percentage: null }
  }
  const direction: ChangeDirection = difference > 0 ? 'up' : difference < 0 ? 'down' : 'same'
  return { direction, difference: Math.abs(difference), percentage: Math.abs(changePercentage) }
}
