import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { AuthProvider } from './context/AuthProvider'
import { getToken, setToken } from './services/tokenStorage'
import type { DashboardSummary, Period } from './types/api'

function summaryFor(period: Period): DashboardSummary {
  return {
    period,
    from: '2026-11-01',
    to: '2026-11-30',
    totalSpent: 5120,
    previousTotal: 3200,
    changePercentage: 60,
    limit: { limitAmount: 5000, remaining: -120, percentageUsed: 102.4, exceeded: true },
    byCategory: [{ categoryId: 1, name: 'Comida', color: '#FF8A00', amount: 5120, percentage: 100 }],
    breakdown: period === 'DAY' ? [] : [{ label: '2026-11-01', amount: 5120 }],
  }
}

const COMIDA = { id: 1, name: 'Comida', color: '#FF8A00' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Minimal fake of the API described in the spec, enough to mount the app. */
function stubApi(options: { authorized: boolean }) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    if (!options.authorized) {
      return json(401, { status: 401, error: 'Unauthorized', message: 'Token inválido' })
    }
    if (url.pathname === '/api/auth/me') return json(200, { id: 1, username: 'ana' })
    if (url.pathname === '/api/dashboard/summary') {
      return json(200, summaryFor(url.searchParams.get('period') as Period))
    }
    if (url.pathname === '/api/categories') return json(200, [COMIDA])
    if (url.pathname === '/api/expenses' && init?.method === 'POST') {
      return json(201, {
        expense: { id: 9, amount: 150.5, description: 'Almuerzo', date: '2026-11-15', category: COMIDA, tags: [] },
        exceededLimits: [],
      })
    }
    return json(404, { status: 404, error: 'Not Found', message: 'No encontrado' })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App routing', () => {
  it('sends visitors without a session to the login page', () => {
    stubApi({ authorized: true })
    renderApp('/gastos')

    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('shows the dashboard on the Month tab with the exceeded-limit alert', async () => {
    setToken('valid-token')
    const fetchMock = stubApi({ authorized: true })
    const user = userEvent.setup()
    renderApp('/')

    expect(await screen.findByRole('tab', { name: 'Mes' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByTestId('total-spent')).toHaveTextContent('5,120.00')
    expect(screen.getByTestId('total-spent')).toHaveClass('text-danger')
    expect(screen.getByRole('alert')).toHaveTextContent('Límite excedido')
    expect(screen.getByTestId('period-change')).toHaveTextContent('Subió 1,920.00 (60%)')
    expect(screen.getByRole('heading', { name: 'Gasto por día' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Día' }))

    expect(await screen.findByTestId('total-spent')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gasto por día' })).not.toBeInTheDocument()
    const requested = fetchMock.mock.calls.map(([input]) => String(input))
    expect(requested).toContain('/api/dashboard/summary?period=MONTH')
    expect(requested).toContain('/api/dashboard/summary?period=DAY')
  })

  it('adds an expense from the dashboard and refreshes the summary', async () => {
    setToken('valid-token')
    const fetchMock = stubApi({ authorized: true })
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Agregar gasto' }))
    await user.type(await screen.findByLabelText('Monto'), '150.50')
    await user.type(screen.getByLabelText('Descripción'), 'Almuerzo')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Comida')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Agregar gasto' }))

    expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const post = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === '/api/expenses' && init?.method === 'POST',
    )
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      amount: 150.5,
      description: 'Almuerzo',
      categoryId: 1,
      tags: [],
    })
    const summaryRequests = fetchMock.mock.calls.filter(
      ([input]) => String(input) === '/api/dashboard/summary?period=MONTH',
    )
    expect(summaryRequests).toHaveLength(2)
  })

  it('clears the token and returns to the login page when the API answers 401', async () => {
    setToken('expired-token')
    stubApi({ authorized: false })
    renderApp('/')

    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })
})
