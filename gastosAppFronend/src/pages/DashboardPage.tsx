import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { AddExpenseDialog } from '../components/AddExpenseDialog'
import { BreakdownChart } from '../components/dashboard/BreakdownChart'
import { CategoryChart } from '../components/dashboard/CategoryChart'
import { LimitProgress } from '../components/dashboard/LimitProgress'
import { PeriodTabs } from '../components/dashboard/PeriodTabs'
import { TotalCard } from '../components/dashboard/TotalCard'
import { ExceededLimitsAlert } from '../components/ExceededLimitsAlert'
import { EmptyState, ErrorState, Loading } from '../components/StatusViews'
import { useDashboardSummary } from '../hooks/useDashboardSummary'
import { ROUTES } from '../routes'
import type { ExceededLimit, ExpenseSaveResponse, Period } from '../types/api'
import { formatDate, formatMoney } from '../utils/format'
import { DASHBOARD_PANEL_ID, periodTabId } from '../utils/ids'
import { CURRENT_PERIOD_TITLES, DEFAULT_PERIOD } from '../utils/periods'

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)
  const { summary, loading, error, reload } = useDashboardSummary(period)
  /** A new object per opening, so a late answer can tell its own dialog from a later one. */
  const [addDialog, setAddDialog] = useState<{ kind: 'add' } | null>(null)
  /** Limits left exceeded by the expense just added; `null` when nothing was added yet. */
  const [savedNotice, setSavedNotice] = useState<ExceededLimit[] | null>(null)
  const closeDialog = useCallback(() => setAddDialog(null), [])
  const exceeded = summary?.limit?.exceeded === true

  function handleSelectPeriod(next: Period) {
    setPeriod(next)
    setSavedNotice(null)
  }

  function handleSaved(response: ExpenseSaveResponse) {
    setSavedNotice(response.exceededLimits)
    setAddDialog((current) => (current === addDialog ? null : current))
    reload()
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{CURRENT_PERIOD_TITLES[period]}</h1>
          {summary && (
            <p className="muted period-range">
              {summary.from === summary.to
                ? formatDate(summary.from)
                : `${formatDate(summary.from)} – ${formatDate(summary.to)}`}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setSavedNotice(null)
            setAddDialog({ kind: 'add' })
          }}
        >
          Agregar gasto
        </button>
      </header>

      <PeriodTabs selected={period} onSelect={handleSelectPeriod} />

      {savedNotice && (
        <>
          <p className="alert alert-success" role="status">
            Gasto agregado.
          </p>
          {/* The banner below already covers the visible period. An entry with a different total
              belongs to another period of the same type (an expense dated in the past) and stays.
              While the summary reloads its total is the old one and cannot tell them apart, so the
              entry waits: otherwise the same period would show two alerts with different amounts. */}
          <ExceededLimitsAlert
            exceededLimits={savedNotice.filter(
              (limit) =>
                !(exceeded && limit.period === period && (loading || limit.spent === summary?.totalSpent)),
            )}
            onDismiss={() => setSavedNotice([])}
          />
        </>
      )}

      <div id={DASHBOARD_PANEL_ID} role="tabpanel" aria-labelledby={periodTabId(period)} className="dashboard">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !summary ? (
          <Loading label="Cargando resumen…" />
        ) : (
          <>
            {exceeded && summary.limit && (
              <div className="alert alert-danger" role="alert">
                <strong>Límite excedido.</strong> Te pasaste por {formatMoney(Math.abs(summary.limit.remaining))} de tu
                límite de {CURRENT_PERIOD_TITLES[summary.period].toLowerCase()}, que es de{' '}
                {formatMoney(summary.limit.limitAmount)}.
              </div>
            )}

            <div className="hero">
              <TotalCard
                period={summary.period}
                totalSpent={summary.totalSpent}
                previousTotal={summary.previousTotal}
                changePercentage={summary.changePercentage}
                exceeded={exceeded}
              />
              {summary.limit ? (
                <LimitProgress limit={summary.limit} totalSpent={summary.totalSpent} />
              ) : (
                <p className="muted">
                  No tienes límite para este período. <Link to={ROUTES.limits}>Fijar un límite</Link>
                </p>
              )}
            </div>

            <div className={summary.period === 'DAY' ? 'dashboard-columns dashboard-columns-single' : 'dashboard-columns'}>
              <section className="panel" aria-labelledby="by-category-title">
                <h2 id="by-category-title">Gastos por categoría</h2>
                {summary.byCategory.length === 0 ? (
                  <EmptyState title="Sin gastos en este período">
                    <p>Agrega un gasto y aparecerá aquí por categoría.</p>
                  </EmptyState>
                ) : (
                  <CategoryChart categories={summary.byCategory} />
                )}
              </section>

              {/* The breakdown chart is omitted on the Day tab (its breakdown is always empty). */}
              {summary.period !== 'DAY' && (
                <section className="panel" aria-labelledby="breakdown-title">
                  <h2 id="breakdown-title">{summary.period === 'YEAR' ? 'Gasto por mes' : 'Gasto por día'}</h2>
                  {summary.breakdown.length === 0 ? (
                    <EmptyState title="Sin datos para mostrar" />
                  ) : (
                    <BreakdownChart points={summary.breakdown} exceeded={exceeded} />
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </div>

      {addDialog && <AddExpenseDialog onSaved={handleSaved} onClose={closeDialog} />}
    </section>
  )
}
