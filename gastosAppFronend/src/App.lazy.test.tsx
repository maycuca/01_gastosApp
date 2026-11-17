import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installApi, json, renderAppAt, summary } from './test/fakeApi'
import type { Period } from './types/api'

// Records which modules get evaluated, to check that the protected pages (and Recharts with
// the dashboard) are only loaded when one of them is shown. The limits page waits for `gate`,
// so the loading indicator shown meanwhile can be checked.
const loaded = vi.hoisted(() => {
  let open: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  return { modules: new Set<string>(), gate, openGate: () => open() }
})

vi.mock('recharts', async (importOriginal) => {
  loaded.modules.add('recharts')
  return await importOriginal<typeof import('recharts')>()
})
vi.mock('./pages/DashboardPage', async (importOriginal) => {
  loaded.modules.add('DashboardPage')
  return await importOriginal<typeof import('./pages/DashboardPage')>()
})
vi.mock('./pages/ExpensesPage', async (importOriginal) => {
  loaded.modules.add('ExpensesPage')
  return await importOriginal<typeof import('./pages/ExpensesPage')>()
})
vi.mock('./pages/CategoriesPage', async (importOriginal) => {
  loaded.modules.add('CategoriesPage')
  return await importOriginal<typeof import('./pages/CategoriesPage')>()
})
vi.mock('./pages/AccountPage', async (importOriginal) => {
  loaded.modules.add('AccountPage')
  return await importOriginal<typeof import('./pages/AccountPage')>()
})
vi.mock('./pages/LimitsPage', async (importOriginal) => {
  loaded.modules.add('LimitsPage')
  await loaded.gate
  return await importOriginal<typeof import('./pages/LimitsPage')>()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// The tests run in order and share the module registry of this file on purpose.
describe('Lazy loading of the protected pages', () => {
  it('the login and register pages load no protected page and not Recharts', async () => {
    installApi(() => undefined)
    const user = userEvent.setup()
    renderAppAt('/login', { loggedIn: false })

    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Regístrate' }))
    expect(await screen.findByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument()

    expect([...loaded.modules]).toEqual([])
  })

  it('shows the loading indicator inside the layout while the code of a page arrives', async () => {
    installApi((call) => (call.path === '/api/limits' ? json(200, []) : undefined))
    renderAppAt('/limites')

    expect(await screen.findByText('Cargando página…')).toBeInTheDocument()
    // The menu is already there; only the page is pending.
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Límites' })).not.toBeInTheDocument()
    await waitFor(() => expect(loaded.modules.has('LimitsPage')).toBe(true))
    expect(loaded.modules.has('recharts')).toBe(false)
    expect(loaded.modules.has('DashboardPage')).toBe(false)

    loaded.openGate()

    expect(await screen.findByRole('heading', { level: 1, name: 'Límites' })).toBeInTheDocument()
    expect(screen.queryByText('Cargando página…')).not.toBeInTheDocument()
  })

  it('the dashboard brings Recharts when it is shown', async () => {
    installApi((call) =>
      call.path === '/api/dashboard/summary' ? json(200, summary(call.query.get('period') as Period)) : undefined,
    )
    renderAppAt('/')

    expect(await screen.findByTestId('total-spent')).toBeInTheDocument()
    expect(loaded.modules.has('DashboardPage')).toBe(true)
    expect(loaded.modules.has('recharts')).toBe(true)
  })
})
