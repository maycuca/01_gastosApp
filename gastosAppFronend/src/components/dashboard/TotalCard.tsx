import type { Period } from '../../types/api'
import { describeChange } from '../../utils/comparison'
import { formatMoney, formatPercentage } from '../../utils/format'
import { COMPARED_TO_PREVIOUS, PREVIOUS_PERIOD_LABELS } from '../../utils/periods'

interface TotalCardProps {
  period: Period
  totalSpent: number
  previousTotal: number
  changePercentage: number | null
  /** Shows the total in red. */
  exceeded: boolean
}

/** Total of the period and its comparison with the previous one (amount, percentage and direction). */
export function TotalCard({ period, totalSpent, previousTotal, changePercentage, exceeded }: TotalCardProps) {
  const change = describeChange(totalSpent, previousTotal, changePercentage)
  const comparedTo = COMPARED_TO_PREVIOUS[period]

  return (
    <section className="total-card" aria-label="Total gastado">
      <p className={exceeded ? 'total-amount text-danger' : 'total-amount'} data-testid="total-spent">
        {formatMoney(totalSpent)}
      </p>
      <p className="change" data-testid="period-change">
        {change.direction === 'none' && 'Sin datos previos para comparar'}
        {change.direction === 'same' && `Sin cambio ${comparedTo}`}
        {change.direction === 'up' && (
          <>
            <span aria-hidden="true">▲ </span>
            Subió {formatMoney(change.difference)}
            {change.percentage !== null && ` (${formatPercentage(change.percentage)})`} {comparedTo}
          </>
        )}
        {change.direction === 'down' && (
          <>
            <span aria-hidden="true">▼ </span>
            Bajó {formatMoney(change.difference)}
            {change.percentage !== null && ` (${formatPercentage(change.percentage)})`} {comparedTo}
          </>
        )}
      </p>
      {change.direction !== 'none' && (
        <p className="muted">
          {PREVIOUS_PERIOD_LABELS[period]}: {formatMoney(previousTotal)}
        </p>
      )}
    </section>
  )
}
