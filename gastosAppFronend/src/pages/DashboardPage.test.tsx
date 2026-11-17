import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, COMIDA, expense, installApi, json, renderAppAt, summary } from '../test/fakeApi'
import type { ApiHandler } from '../test/fakeApi'
import { getToken } from '../services/tokenStorage'
import type { DashboardSummary, ExceededLimit, Period } from '../types/api'

// jsdom has no layout, so Recharts draws nothing. These stand-ins expose what the
// page passes to the chart: the points and the color of the bars.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  BarChart: ({ data, children }: { data: unknown; children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'bar-chart', 'data-points': JSON.stringify(data) }, children),
  Bar: ({ fill, dataKey }: { fill: string; dataKey: string }) =>
    createElement('div', { 'data-testid': 'bars', 'data-fill': fill, 'data-key': dataKey }),
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

const RED = '#c4201c'
const PEN = '#2340b0'

const WITHIN_LIMIT = { limitAmount: 5000, remaining: 149.5, percentageUsed: 97.01, exceeded: false }
const OVER_LIMIT = { limitAmount: 5000, remaining: -120, percentageUsed: 102.4, exceeded: true }

interface ApiOptions {
  summaries?: Partial<Record<Period, Partial<DashboardSummary>>>
  exceededLimits?: ExceededLimit[]
  override?: ApiHandler
}

function dashboardApi(options: ApiOptions = {}) {
  return installApi((call) => {
    const overridden = options.override?.(call)
    if (overridden) return overridden
    if (call.path === '/api/dashboard/summary') {
      const period = call.query.get('period') as Period
      return json(200, summary(period, options.summaries?.[period]))
    }
    if (call.path === '/api/categories') return json(200, [COMIDA])
    if (call.path === '/api/expenses' && call.method === 'POST') {
      return json(201, { expense: expense(), exceededLimits: options.exceededLimits ?? [] })
    }
    if (call.path === '/api/expenses') return json(200, { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 })
    if (call.path === '/api/limits') return json(200, [])
    return undefined
  })
}

async function openDashboard() {
  renderAppAt('/')
  await screen.findByTestId('total-spent')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashboardPage: tabs and periods', () => {
  it('shows the five tabs with Mes selected by default', async () => {
    const api = dashboardApi()
    await openDashboard()

    const tabs = within(screen.getByRole('tablist', { name: 'Período' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Día', 'Semana', 'Quincena', 'Mes', 'Año'])
    expect(screen.getByRole('tab', { name: 'Mes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 1, name: 'Este mes' })).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/dashboard/summary').map((call) => call.query.get('period'))).toEqual(['MONTH'])
  })

  it.each([
    ['Día', 'DAY', 'Hoy'],
    ['Semana', 'WEEK', 'Esta semana'],
    ['Quincena', 'FORTNIGHT', 'Esta quincena'],
    ['Año', 'YEAR', 'Este año'],
  ] as const)('the %s tab requests %s and is titled "%s"', async (tab, period, title) => {
    const api = dashboardApi({
      summaries: { [period]: { from: '2026-11-16', to: '2026-11-22', totalSpent: 77.7 } },
    })
    const user = userEvent.setup()
    await openDashboard()

    await user.click(screen.getByRole('tab', { name: tab }))

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('total-spent')).toHaveTextContent('77.70'))
    expect(api.lastCallTo('GET', '/api/dashboard/summary').query.get('period')).toBe(period)
    expect(screen.getByText(/^16 nov\.? 2026 – 22 nov\.? 2026$/)).toBeInTheDocument()
    // One period at a time: only the chosen tab is selected.
    const selected = screen.getAllByRole('tab').filter((item) => item.getAttribute('aria-selected') === 'true')
    expect(selected.map((item) => item.textContent)).toEqual([tab])
  })

  it('shows the range of dates of the period under the title', async () => {
    dashboardApi({ summaries: { MONTH: { from: '2026-11-01', to: '2026-11-30' } } })
    await openDashboard()

    expect(screen.getByText(/^1 nov\.? 2026 – 30 nov\.? 2026$/)).toBeInTheDocument()
  })

  it('shows a single date on the Day tab and omits the breakdown chart', async () => {
    dashboardApi({ summaries: { DAY: { from: '2026-11-18', to: '2026-11-18' } } })
    const user = userEvent.setup()
    await openDashboard()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Día' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Hoy' })).toBeInTheDocument()
    expect(await screen.findByText(/^18 nov\.? 2026$/)).toBeInTheDocument()
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Gasto por/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gastos por categoría' })).toBeInTheDocument()
  })

  it('the Year tab charts one bar per month', async () => {
    const months = Array.from({ length: 12 }, (_, index) => ({
      label: `2026-${String(index + 1).padStart(2, '0')}`,
      amount: index === 10 ? 4850.5 : 0,
    }))
    dashboardApi({ summaries: { YEAR: { from: '2026-01-01', to: '2026-12-31', breakdown: months } } })
    const user = userEvent.setup()
    await openDashboard()
    expect(screen.getByRole('heading', { name: 'Gasto por día' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Año' }))

    expect(await screen.findByRole('heading', { name: 'Gasto por mes' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gasto por día' })).not.toBeInTheDocument()
    expect(screen.getByText(/^1 ene\.? 2026 – 31 dic\.? 2026$/)).toBeInTheDocument()
    const points = JSON.parse(screen.getByTestId('bar-chart').getAttribute('data-points') ?? '[]') as unknown[]
    expect(points).toEqual(months)
    expect(screen.getByTestId('period-change')).toHaveTextContent('frente al año pasado')
  })

  it('changes the period with the arrow keys and requests its summary', async () => {
    const api = dashboardApi()
    const user = userEvent.setup()
    await openDashboard()

    screen.getByRole('tab', { name: 'Mes' }).focus()
    await user.keyboard('{ArrowLeft}')

    expect(screen.getByRole('tab', { name: 'Quincena' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Quincena' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Quincena' })).toHaveClass('tab-active')
    await waitFor(() =>
      expect(api.callsTo('GET', '/api/dashboard/summary').map((call) => call.query.get('period'))).toContain(
        'FORTNIGHT',
      ),
    )

    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Año' })).toHaveFocus()
    await waitFor(() =>
      expect(api.callsTo('GET', '/api/dashboard/summary').map((call) => call.query.get('period'))).toContain('YEAR'),
    )
  })

  it('marks the active tab with the highlighter class', async () => {
    dashboardApi()
    const user = userEvent.setup()
    await openDashboard()

    expect(screen.getByRole('tab', { name: 'Mes' })).toHaveClass('tab-active')
    expect(screen.getByRole('tab', { name: 'Año' })).not.toHaveClass('tab-active')

    await user.click(screen.getByRole('tab', { name: 'Año' }))

    expect(screen.getByRole('tab', { name: 'Año' })).toHaveClass('tab-active')
    expect(screen.getByRole('tab', { name: 'Mes' })).not.toHaveClass('tab-active')
  })
})

describe('DashboardPage: total and comparison', () => {
  it('shows the total and how much it went up against the previous period', async () => {
    dashboardApi()
    await openDashboard()

    expect(screen.getByTestId('total-spent')).toHaveTextContent('4,850.50')
    expect(screen.getByTestId('period-change')).toHaveTextContent('Subió 1,650.50 (51.58%) frente al mes pasado')
    expect(screen.getByText('Mes pasado: 3,200.00')).toBeInTheDocument()
  })

  it('shows how much it went down', async () => {
    dashboardApi({ summaries: { MONTH: { totalSpent: 150, previousTotal: 200, changePercentage: -25 } } })
    await openDashboard()

    expect(screen.getByTestId('period-change')).toHaveTextContent('Bajó 50.00 (25%) frente al mes pasado')
    expect(screen.getByText('Mes pasado: 200.00')).toBeInTheDocument()
  })

  it('says there is no change when both totals are equal', async () => {
    dashboardApi({ summaries: { MONTH: { totalSpent: 200, previousTotal: 200, changePercentage: 0 } } })
    await openDashboard()

    expect(screen.getByTestId('period-change')).toHaveTextContent('Sin cambio frente al mes pasado')
  })

  it('says there is nothing to compare when changePercentage is null', async () => {
    dashboardApi({ summaries: { MONTH: { totalSpent: 150, previousTotal: 0, changePercentage: null } } })
    await openDashboard()

    expect(screen.getByTestId('total-spent')).toHaveTextContent('150.00')
    expect(screen.getByTestId('period-change')).toHaveTextContent('Sin datos previos para comparar')
    expect(screen.getByTestId('period-change')).not.toHaveTextContent('%')
    expect(screen.getByTestId('period-change')).not.toHaveTextContent(/null|NaN|Infinity/)
    expect(screen.queryByText(/^Mes pasado:/)).not.toBeInTheDocument()
  })
})

describe('DashboardPage: limit', () => {
  it('without a limit offers a link to set one and shows nothing in red', async () => {
    dashboardApi({ summaries: { MONTH: { limit: null } } })
    const user = userEvent.setup()
    await openDashboard()

    expect(screen.getByText(/No tienes límite para este período/)).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('total-spent')).not.toHaveClass('text-danger')
    expect(screen.getByTestId('bars')).toHaveAttribute('data-fill', PEN)

    const link = screen.getByRole('link', { name: 'Fijar un límite' })
    expect(link).toHaveAttribute('href', '/limites')
    await user.click(link)
    expect(await screen.findByRole('heading', { level: 1, name: 'Límites' })).toBeInTheDocument()
  })

  it('with a limit that is not exceeded shows the ruler with the mark and no red', async () => {
    dashboardApi({ summaries: { MONTH: { limit: WITHIN_LIMIT } } })
    await openDashboard()

    const ruler = screen.getByRole('region', { name: 'Límite del período' })
    const track = within(ruler).getByRole('progressbar', { name: 'Uso del límite' })
    expect(track).toHaveAttribute('aria-valuenow', '97')
    expect(track).toHaveAttribute('aria-valuetext', '97.01% del límite')
    expect(track.querySelector('.ruler-fill')).toBeInTheDocument()
    expect(track.querySelector('.ruler-mark')).toBeInTheDocument()
    expect(track.querySelector('.ruler-over')).not.toBeInTheDocument()
    expect(ruler).toHaveTextContent('Límite 5,000.00')
    expect(ruler).toHaveTextContent('Llevas 97.01% de tu límite. Te quedan 149.50.')
    // The mark sits at the limit (the end of the scale) and the fill at 4850.50 / 5000.
    expect(ruler.style.getPropertyValue('--limit-pos')).toBe('100%')
    expect(Number.parseFloat(ruler.style.getPropertyValue('--fill'))).toBeCloseTo(97.01, 2)

    expect(screen.queryByRole('link', { name: 'Fijar un límite' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('total-spent')).not.toHaveClass('text-danger')
    expect(screen.getByTestId('bars')).toHaveAttribute('data-fill', PEN)
  })

  it('with the limit exceeded shows total, ruler excess and bars in red plus the alert banner', async () => {
    dashboardApi({
      summaries: { MONTH: { totalSpent: 5120, previousTotal: 3200, changePercentage: 60, limit: OVER_LIMIT } },
    })
    await openDashboard()

    expect(screen.getByTestId('total-spent')).toHaveTextContent('5,120.00')
    expect(screen.getByTestId('total-spent')).toHaveClass('text-danger')

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('alert-danger')
    expect(alert).toHaveTextContent('Límite excedido.')
    expect(alert).toHaveTextContent('Te pasaste por 120.00')
    expect(alert).toHaveTextContent('5,000.00')

    const ruler = screen.getByRole('region', { name: 'Límite del período' })
    expect(ruler.querySelector('.ruler-over')).toBeInTheDocument()
    expect(ruler.querySelector('.ruler-mark')).toBeInTheDocument()
    // Scale fits the total: the mark is at 5000 / 5120 and the red part is the rest.
    expect(Number.parseFloat(ruler.style.getPropertyValue('--limit-pos'))).toBeCloseTo(97.66, 2)
    expect(Number.parseFloat(ruler.style.getPropertyValue('--fill'))).toBeCloseTo(97.66, 2)
    expect(Number.parseFloat(ruler.style.getPropertyValue('--over'))).toBeCloseTo(2.34, 2)

    expect(screen.getByTestId('bars')).toHaveAttribute('data-fill', RED)
  })

  it('shows the limit of each tab independently', async () => {
    dashboardApi({ summaries: { MONTH: { limit: OVER_LIMIT, totalSpent: 5120 }, WEEK: { limit: null } } })
    const user = userEvent.setup()
    await openDashboard()
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Semana' }))

    expect(await screen.findByRole('link', { name: 'Fijar un límite' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('total-spent')).not.toHaveClass('text-danger')
  })
})

describe('DashboardPage: charts', () => {
  it('draws the category strip in proportion with the color of each category', async () => {
    dashboardApi()
    await openDashboard()

    const panel = screen.getByRole('region', { name: 'Gastos por categoría' })
    const parts = Array.from(panel.querySelectorAll<HTMLElement>('.category-strip > span'))
    expect(parts).toHaveLength(2)
    expect(parts[0]).toHaveStyle({ backgroundColor: '#FF8A00' })
    expect(parts[1]).toHaveStyle({ backgroundColor: '#2196F3' })
    expect(parts[0].style.flexGrow).toBe('3350.5')
    expect(parts[1].style.flexGrow).toBe('1500')

    const rows = within(panel).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Comida')
    expect(rows[0]).toHaveTextContent('3,350.50')
    expect(rows[0]).toHaveTextContent('69.08%')
    expect(rows[0].querySelector('.color-dot')).toHaveStyle({ backgroundColor: '#FF8A00' })
    expect(rows[1]).toHaveTextContent('Transporte')
    expect(rows[1]).toHaveTextContent('1,500.00')
    expect(rows[1]).toHaveTextContent('30.92%')
    expect(rows[1].querySelector('.color-dot')).toHaveStyle({ backgroundColor: '#2196F3' })
  })

  it('passes the breakdown points to the bar chart', async () => {
    const breakdown = [
      { label: '2026-11-01', amount: 150 },
      { label: '2026-11-02', amount: 0 },
      { label: '2026-11-03', amount: 80.25 },
    ]
    dashboardApi({ summaries: { MONTH: { breakdown } } })
    await openDashboard()

    const chart = screen.getByTestId('bar-chart')
    expect(JSON.parse(chart.getAttribute('data-points') ?? '[]')).toEqual(breakdown)
    expect(within(chart).getByTestId('bars')).toHaveAttribute('data-key', 'amount')
  })

  it('shows the empty state when nothing was spent in the period', async () => {
    dashboardApi({
      summaries: { MONTH: { totalSpent: 0, previousTotal: 0, changePercentage: null, byCategory: [] } },
    })
    await openDashboard()

    expect(screen.getByTestId('total-spent')).toHaveTextContent('0.00')
    expect(screen.getByText('Sin gastos en este período')).toBeInTheDocument()
    expect(document.querySelector('.category-strip')).not.toBeInTheDocument()
  })

  it('shows the error state and retries', async () => {
    let fail = true
    dashboardApi({
      override: (call) =>
        call.path === '/api/dashboard/summary' && fail ? apiError(500, 'Error interno del servidor') : undefined,
    })
    const user = userEvent.setup()
    renderAppAt('/')

    expect(await screen.findByText('No se pudo cargar la información')).toBeInTheDocument()
    expect(screen.getByText('Error interno del servidor')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByTestId('total-spent')).toHaveTextContent('4,850.50')
  })
})

describe('DashboardPage: add expense', () => {
  async function addExpense(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Agregar gasto' }))
    await user.type(await dialog.findByLabelText('Monto'), '150.50')
    await user.type(dialog.getByLabelText('Descripción'), 'Almuerzo')
    await user.selectOptions(dialog.getByLabelText('Categoría'), 'Comida')
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))
  }

  it('updates the total without reloading the page after saving', async () => {
    let saved = false
    dashboardApi({
      override: (call) => {
        if (call.path === '/api/expenses' && call.method === 'POST') saved = true
        if (call.path === '/api/dashboard/summary') {
          return json(200, summary('MONTH', { totalSpent: saved ? 5001 : 4850.5 }))
        }
        return undefined
      },
    })
    const user = userEvent.setup()
    await openDashboard()
    expect(screen.getByTestId('total-spent')).toHaveTextContent('4,850.50')

    await addExpense(user)

    expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('total-spent')).toHaveTextContent('5,001.00'))
    // Still on the dashboard.
    expect(screen.getByRole('heading', { level: 1, name: 'Este mes' })).toBeInTheDocument()
  })

  it('shows the exceeded-limits alert when the response brings exceededLimits', async () => {
    dashboardApi({ exceededLimits: [{ period: 'WEEK', limitAmount: 1000, spent: 1200.5 }] })
    const user = userEvent.setup()
    await openDashboard()

    await addExpense(user)

    expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Límite excedido: Semana.')
    expect(alert).toHaveTextContent('Semana: gastado 1,200.50 de un límite de 1,000.00')
  })

  it('shows no alert when exceededLimits is empty', async () => {
    dashboardApi({ exceededLimits: [] })
    const user = userEvent.setup()
    await openDashboard()

    await addExpense(user)

    expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('still alerts about the visible period when its limit becomes exceeded', async () => {
    let saved = false
    dashboardApi({
      exceededLimits: [{ period: 'MONTH', limitAmount: 5000, spent: 5120 }],
      override: (call) => {
        if (call.path === '/api/expenses' && call.method === 'POST') saved = true
        if (call.path === '/api/dashboard/summary') {
          return json(
            200,
            summary('MONTH', saved ? { totalSpent: 5120, limit: OVER_LIMIT } : { limit: WITHIN_LIMIT }),
          )
        }
        return undefined
      },
    })
    const user = userEvent.setup()
    await openDashboard()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await addExpense(user)

    await waitFor(() => expect(screen.getByTestId('total-spent')).toHaveTextContent('5,120.00'))
    const alerts = screen.getAllByRole('alert')
    expect(alerts.some((alert) => /Límite excedido/.test(alert.textContent ?? ''))).toBe(true)
    expect(screen.getByTestId('total-spent')).toHaveClass('text-danger')
  })

  it('does not repeat the alert of the visible period when it was already exceeded', async () => {
    dashboardApi({
      summaries: { MONTH: { totalSpent: 5120, limit: OVER_LIMIT } },
      exceededLimits: [{ period: 'MONTH', limitAmount: 5000, spent: 5120 }],
    })
    const user = userEvent.setup()
    await openDashboard()

    await addExpense(user)

    expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('keeps the alert of a past period of the same type while the current one is exceeded', async () => {
    dashboardApi({
      summaries: { MONTH: { totalSpent: 5120, limit: OVER_LIMIT } },
      // An expense dated last month: its MONTH entry describes that month, not the visible one.
      exceededLimits: [{ period: 'MONTH', limitAmount: 5000, spent: 6300 }],
    })
    const user = userEvent.setup()
    await openDashboard()

    await addExpense(user)

    expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent ?? '')
    expect(alerts).toHaveLength(2)
    expect(alerts.some((text) => text.includes('Mes: gastado 6,300.00 de un límite de 5,000.00'))).toBe(true)
  })

  it('closes the form without saving on cancel', async () => {
    const api = dashboardApi()
    const user = userEvent.setup()
    await openDashboard()

    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Agregar gasto' }))
    await user.click(await dialog.findByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.callsTo('POST', '/api/expenses')).toHaveLength(0)
    expect(screen.queryByText('Gasto agregado.')).not.toBeInTheDocument()
  })
})

describe('Layout: navigation', () => {
  it.each([
    ['/', 'Dashboard'],
    ['/gastos', 'Gastos'],
    ['/categorias', 'Categorías'],
    ['/limites', 'Límites'],
  ])('at %s marks only "%s" as the active menu option', async (path, label) => {
    dashboardApi()
    renderAppAt(path)

    const nav = within(await screen.findByRole('navigation', { name: 'Navegación principal' }))
    const links = nav.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Dashboard', 'Gastos', 'Categorías', 'Límites'])
    const active = links.filter((link) => link.classList.contains('nav-link-active'))
    expect(active.map((link) => link.textContent)).toEqual([label])
    expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates between pages from the menu', async () => {
    dashboardApi()
    const user = userEvent.setup()
    await openDashboard()

    await user.click(screen.getByRole('link', { name: 'Gastos' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Gastos' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Categorías' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Categorías' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Límites' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Límites' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Este mes' })).toBeInTheDocument()
  })

  it('logs out by discarding the token, without calling a logout endpoint', async () => {
    const api = dashboardApi()
    const user = userEvent.setup()
    await openDashboard()
    expect(screen.getByText('ana')).toBeInTheDocument()
    const callsBefore = api.calls.length

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
    expect(api.calls).toHaveLength(callsBefore)
  })
})
