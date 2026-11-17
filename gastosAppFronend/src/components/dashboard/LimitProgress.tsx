import type { CSSProperties } from 'react'
import type { DashboardLimit } from '../../types/api'
import { formatMoney, formatPercentage } from '../../utils/format'

interface LimitProgressProps {
  limit: DashboardLimit
  totalSpent: number
}

/**
 * Ruler of the period's limit: spent vs. limit. The scale fits both figures, so the
 * part that goes past the limit mark is drawn in red.
 */
export function LimitProgress({ limit, totalSpent }: LimitProgressProps) {
  const scaleMax = Math.max(limit.limitAmount, totalSpent)
  const limitPosition = scaleMax > 0 ? (limit.limitAmount / scaleMax) * 100 : 100
  const fill = scaleMax > 0 ? (Math.min(totalSpent, limit.limitAmount) / scaleMax) * 100 : 0
  const style = {
    '--limit-pos': `${limitPosition}%`,
    '--fill': `${fill}%`,
    '--over': `${100 - limitPosition}%`,
  } as CSSProperties

  return (
    <section className="ruler" aria-label="Límite del período" style={style}>
      <div
        className="ruler-track"
        role="progressbar"
        aria-label="Uso del límite"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(Math.max(limit.percentageUsed, 0), 100))}
        aria-valuetext={`${formatPercentage(limit.percentageUsed)} del límite`}
      >
        <div className="ruler-fill" />
        {limit.exceeded && <div className="ruler-over" />}
        <div className="ruler-mark" />
      </div>
      <div className="ruler-scale" aria-hidden="true">
        {/* A label that ends at the mark would not fit when the mark sits near the left edge. */}
        <span className={limitPosition < 30 ? 'ruler-limit ruler-limit-start' : 'ruler-limit'}>
          Límite {formatMoney(limit.limitAmount)}
        </span>
      </div>
      {/* When exceeded, the page's alert already states by how much. */}
      {!limit.exceeded && (
        <p className="muted">
          Llevas {formatPercentage(limit.percentageUsed)} de tu límite. Te quedan {formatMoney(limit.remaining)}.
        </p>
      )}
    </section>
  )
}
