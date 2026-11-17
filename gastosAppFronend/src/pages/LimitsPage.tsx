import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LimitRowItem } from '../components/LimitRowItem'
import { EmptyState, ErrorState, Loading } from '../components/StatusViews'
import { useLimits } from '../hooks/useLimits'
import type { Period } from '../types/api'
import { limitHeadingId } from '../utils/ids'
import { periodLabel } from '../utils/periods'

export function LimitsPage() {
  const { rows, loading, error, reload, setLimit, removeLimit } = useLimits()
  const [removing, setRemoving] = useState<Period | null>(null)
  const cancelRemoval = useCallback(() => setRemoving(null), [])
  const focusOnClose = useRef<Period | null>(null)

  async function handleRemove(period: Period) {
    await removeLimit(period)
    focusOnClose.current = period
    // Only if this confirmation is still the open one: a late answer never closes another.
    setRemoving((current) => (current === period ? null : current))
  }

  // The "Quitar" button that opened the confirmation disappears with the limit, so the focus
  // goes to the heading of that period. This runs after the dialog returned the focus to the button.
  useEffect(() => {
    if (removing === null && focusOnClose.current) {
      document.getElementById(limitHeadingId(focusOnClose.current))?.focus()
      focusOnClose.current = null
    }
  }, [removing])

  const hasAnyLimit = rows?.some((row) => row.limit !== null) ?? false

  return (
    <section className="page">
      <header className="page-header">
        <h1>Límites</h1>
      </header>
      <p className="muted">
        Fija un límite de gasto por período. Al superarlo la app te avisa, pero nunca impide registrar gastos.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !rows ? (
        <Loading label="Cargando límites…" />
      ) : (
        <>
          {!hasAnyLimit && (
            <EmptyState title="Aún no has fijado ningún límite">
              <p>Usa "Fijar límite" en el período que quieras controlar.</p>
            </EmptyState>
          )}
          <ul className={loading ? 'card list is-refreshing' : 'card list'} aria-busy={loading}>
            {rows.map((row) => (
              <LimitRowItem
                key={row.period}
                row={row}
                disabled={loading}
                onSave={setLimit}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        </>
      )}

      {removing && (
        <ConfirmDialog
          title="Quitar límite"
          confirmLabel="Quitar"
          onConfirm={() => handleRemove(removing)}
          onCancel={cancelRemoval}
        >
          <p>
            ¿Quitar el límite de <strong>{periodLabel(removing)}</strong>? Tus gastos no se modifican.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}
