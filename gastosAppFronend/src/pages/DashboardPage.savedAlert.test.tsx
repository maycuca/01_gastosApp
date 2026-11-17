import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMIDA, expense, installApi, json, renderAppAt, summary } from '../test/fakeApi'
import type { DashboardSummary, ExceededLimit, Period } from '../types/api'

// Second QA round: after adding an expense from the dashboard, the alert of `exceededLimits`
// leaves out the entry that the banner of the visible period already covers.

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  BarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Bar: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

const WITHIN_LIMIT = { limitAmount: 5000, remaining: 149.5, percentageUsed: 97.01, exceeded: false }
const OVER_LIMIT = { limitAmount: 5000, remaining: -120, percentageUsed: 102.4, exceeded: true }

interface Options {
  /** Summary of each period before and after the expense is saved. */
  before?: Partial<Record<Period, Partial<DashboardSummary>>>
  after?: Partial<Record<Period, Partial<DashboardSummary>>>
  exceededLimits: ExceededLimit[]
}

function dashboardApi(options: Options) {
  let saved = false
  return installApi((call) => {
    if (call.path === '/api/dashboard/summary') {
      const period = call.query.get('period') as Period
      const overrides = saved ? (options.after ?? options.before) : options.before
      return json(200, summary(period, overrides?.[period]))
    }
    if (call.path === '/api/categories') return json(200, [COMIDA])
    if (call.path === '/api/expenses' && call.method === 'POST') {
      saved = true
      return json(201, { expense: expense(), exceededLimits: options.exceededLimits })
    }
    return undefined
  })
}

async function addExpense(user: ReturnType<typeof userEvent.setup>) {
  renderAppAt('/')
  await screen.findByTestId('total-spent')
  await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
  const dialog = within(await screen.findByRole('dialog', { name: 'Agregar gasto' }))
  await user.type(await dialog.findByLabelText('Monto'), '150.50')
  await user.type(dialog.getByLabelText('Descripción'), 'Almuerzo')
  await user.selectOptions(dialog.getByLabelText('Categoría'), 'Comida')
  await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))
  expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
}

function alertTexts(): string[] {
  return screen.queryAllByRole('alert').map((alert) => alert.textContent ?? '')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashboardPage: exceeded limits after adding an expense', () => {
  it('shows only the banner once the visible period becomes exceeded by the new expense', async () => {
    dashboardApi({
      before: { MONTH: { limit: WITHIN_LIMIT } },
      after: { MONTH: { totalSpent: 5120, limit: OVER_LIMIT } },
      exceededLimits: [{ period: 'MONTH', limitAmount: 5000, spent: 5120 }],
    })

    await addExpense(userEvent.setup())

    await waitFor(() => expect(screen.getByTestId('total-spent')).toHaveTextContent('5,120.00'))
    await waitFor(() => expect(alertTexts()).toHaveLength(1))
    expect(alertTexts()[0]).toContain('Te pasaste por 120.00')
    expect(screen.getByText('Gasto agregado.')).toBeInTheDocument()
  })

  it('keeps the other periods in the alert and leaves out only the visible one', async () => {
    dashboardApi({
      before: { MONTH: { totalSpent: 5120, limit: OVER_LIMIT } },
      exceededLimits: [
        { period: 'WEEK', limitAmount: 1000, spent: 1200.5 },
        { period: 'MONTH', limitAmount: 5000, spent: 5120 },
        { period: 'YEAR', limitAmount: 20000, spent: 20500 },
      ],
    })

    await addExpense(userEvent.setup())

    const saved = alertTexts().find((text) => text.includes('El gasto se guardó de todas formas'))
    expect(saved).toBeDefined()
    expect(saved).toContain('Límites excedidos: Semana, Año.')
    expect(saved).toContain('Semana: gastado 1,200.50 de un límite de 1,000.00')
    expect(saved).toContain('Año: gastado 20,500.00 de un límite de 20,000.00')
    expect(saved).not.toContain('Mes')
    // Banner of the visible period + alert of the others.
    expect(alertTexts()).toHaveLength(2)
  })

  it('shows the entry of the visible period type when the visible period itself is not exceeded', async () => {
    // An expense dated last month exceeded that month; the current month is within its limit.
    dashboardApi({
      before: { MONTH: { limit: WITHIN_LIMIT } },
      exceededLimits: [{ period: 'MONTH', limitAmount: 5000, spent: 6300 }],
    })

    await addExpense(userEvent.setup())

    expect(alertTexts()).toHaveLength(1)
    expect(alertTexts()[0]).toContain('Límite excedido: Mes.')
    expect(alertTexts()[0]).toContain('Mes: gastado 6,300.00 de un límite de 5,000.00')
    expect(screen.getByTestId('total-spent')).not.toHaveClass('text-danger')
  })

  it('shows the entry again as the only alert when the visible tab changes to a period that is not exceeded', async () => {
    dashboardApi({
      before: { MONTH: { totalSpent: 5120, limit: OVER_LIMIT } },
      exceededLimits: [{ period: 'WEEK', limitAmount: 1000, spent: 1200.5 }],
    })
    const user = userEvent.setup()

    await addExpense(user)
    expect(alertTexts().some((text) => text.includes('Límite excedido: Semana.'))).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Cerrar alerta' }))

    expect(alertTexts()).toHaveLength(1)
    expect(alertTexts()[0]).toContain('Te pasaste por 120.00')
    expect(screen.getByText('Gasto agregado.')).toBeInTheDocument()
  })
})
