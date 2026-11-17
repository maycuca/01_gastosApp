import type { ExceededLimit } from '../types/api'
import { formatMoney } from '../utils/format'
import { periodLabel } from '../utils/periods'

interface ExceededLimitsAlertProps {
  exceededLimits: readonly ExceededLimit[]
  onDismiss: () => void
}

/** Warning shown after saving an expense that left one or more limits exceeded. The expense is already saved. */
export function ExceededLimitsAlert({ exceededLimits, onDismiss }: ExceededLimitsAlertProps) {
  if (exceededLimits.length === 0) return null
  const names = exceededLimits.map((limit) => periodLabel(limit.period)).join(', ')

  return (
    <div className="alert alert-danger alert-dismissible" role="alert">
      <div>
        <p>
          <strong>
            {exceededLimits.length === 1 ? 'Límite excedido: ' : 'Límites excedidos: '}
            {names}.
          </strong>{' '}
          El gasto se guardó de todas formas.
        </p>
        <ul className="alert-list">
          {exceededLimits.map((limit) => (
            <li key={limit.period}>
              {periodLabel(limit.period)}: gastado {formatMoney(limit.spent)} de un límite de{' '}
              {formatMoney(limit.limitAmount)}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="btn btn-ghost btn-icon" onClick={onDismiss} aria-label="Cerrar alerta">
        ×
      </button>
    </div>
  )
}
