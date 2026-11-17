import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMIDA, expense, installApi, json, renderAppAt, summary } from '../test/fakeApi'
import type { DashboardSummary, ExceededLimit } from '../types/api'

// While the summary reloads after an expense is added, the page still shows the old total.
// The visible period must show one alert at every moment, never the old banner next to the
// entry of `exceededLimits` for the same period.

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  BarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Bar: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

const BEFORE: Partial<DashboardSummary> = {
  totalSpent: 5120,
  limit: { limitAmount: 5000, remaining: -120, percentageUsed: 102.4, exceeded: true },
}
const AFTER: Partial<DashboardSummary> = {
  totalSpent: 5270.5,
  limit: { limitAmount: 5000, remaining: -270.5, percentageUsed: 105.41, exceeded: true },
}

/** The summary requested after the save stays in flight until `releaseReload` is called. */
function dashboardApi(exceededLimits: ExceededLimit[]) {
  let saved = false
  let releaseReload: () => void = () => {}
  const reloadGate = new Promise<void>((resolve) => {
    releaseReload = resolve
  })
  installApi((call) => {
    if (call.path === '/api/dashboard/summary') {
      if (!saved) return json(200, summary('MONTH', BEFORE))
      return reloadGate.then(() => json(200, summary('MONTH', AFTER)))
    }
    if (call.path === '/api/categories') return json(200, [COMIDA])
    if (call.path === '/api/expenses' && call.method === 'POST') {
      saved = true
      return json(201, { expense: expense(), exceededLimits })
    }
    return undefined
  })
  return { releaseReload: () => releaseReload() }
}

async function addExpense() {
  const user = userEvent.setup()
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

describe('DashboardPage: exceeded limits while the summary reloads', () => {
  it('shows a single alert for the visible period before and after the reload', async () => {
    const api = dashboardApi([{ period: 'MONTH', limitAmount: 5000, spent: 5270.5 }])

    await addExpense()

    // Reload in flight: old total on screen, new total in the response of the save.
    expect(screen.getByTestId('total-spent')).toHaveTextContent('5,120.00')
    expect(alertTexts()).toHaveLength(1)
    expect(alertTexts()[0]).toContain('Te pasaste por 120.00')

    api.releaseReload()

    await waitFor(() => expect(screen.getByTestId('total-spent')).toHaveTextContent('5,270.50'))
    expect(alertTexts()).toHaveLength(1)
    expect(alertTexts()[0]).toContain('Te pasaste por 270.50')
    expect(screen.getByText('Gasto agregado.')).toBeInTheDocument()
  })

  it('keeps the other periods in the alert while the summary reloads', async () => {
    const api = dashboardApi([
      { period: 'WEEK', limitAmount: 1000, spent: 1200.5 },
      { period: 'MONTH', limitAmount: 5000, spent: 5270.5 },
    ])

    await addExpense()

    const saved = alertTexts().find((text) => text.includes('El gasto se guardó de todas formas'))
    expect(saved).toContain('Límite excedido: Semana.')
    expect(saved).not.toContain('Mes')
    expect(alertTexts()).toHaveLength(2)

    api.releaseReload()
    await waitFor(() => expect(screen.getByTestId('total-spent')).toHaveTextContent('5,270.50'))
    expect(alertTexts()).toHaveLength(2)
    expect(alertTexts().some((text) => text.includes('Límite excedido: Semana.'))).toBe(true)
  })

  it('shows the entry of a past period of the same type once the reloaded total tells them apart', async () => {
    // The expense was dated last month: it exceeded that month, not the visible one.
    const api = dashboardApi([{ period: 'MONTH', limitAmount: 5000, spent: 6300 }])

    await addExpense()
    api.releaseReload()

    await waitFor(() => expect(screen.getByTestId('total-spent')).toHaveTextContent('5,270.50'))
    const saved = alertTexts().find((text) => text.includes('El gasto se guardó de todas formas'))
    expect(saved).toContain('Mes: gastado 6,300.00 de un límite de 5,000.00')
    // Banner of the visible month + alert of the past month.
    expect(alertTexts()).toHaveLength(2)
    expect(alertTexts().some((text) => text.includes('Te pasaste por 270.50'))).toBe(true)
  })
})
