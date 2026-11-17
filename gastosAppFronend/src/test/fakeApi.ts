import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import { AuthProvider } from '../context/AuthProvider'
import { setToken } from '../services/tokenStorage'
import type { Category, DashboardSummary, Expense, Page, Period } from '../types/api'

/** One request received by the fake API. */
export interface ApiCall {
  method: string
  path: string
  query: URLSearchParams
  /** Parsed JSON body, or `undefined` when the request had none. */
  body: unknown
  authorization: string | null
}

/** Returns the response for a call, or `undefined` to fall back to the defaults. */
export type ApiHandler = (call: ApiCall) => Response | Promise<Response> | undefined

export interface FakeApi {
  calls: ApiCall[]
  callsTo: (method: string, path: string) => ApiCall[]
  lastCallTo: (method: string, path: string) => ApiCall
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

/** Error body in the format of spec section 1. */
export function apiError(
  status: number,
  message: string,
  fieldErrors?: { field: string; message: string }[],
): Response {
  const names: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    404: 'Not Found',
    409: 'Conflict',
    500: 'Internal Server Error',
  }
  return json(status, { status, error: names[status] ?? 'Error', message, ...(fieldErrors ? { fieldErrors } : {}) })
}

/**
 * Replaces `fetch` with a fake of the API of the spec. `GET /api/auth/me` answers
 * a logged-in user unless the handler says otherwise; unknown routes answer 404.
 */
export function installApi(handler: ApiHandler): FakeApi {
  const calls: ApiCall[] = []
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const call: ApiCall = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      authorization: new Headers(init?.headers).get('Authorization'),
    }
    calls.push(call)
    const response = await handler(call)
    if (response) return response
    if (call.method === 'GET' && call.path === '/api/auth/me') return json(200, { id: 1, username: 'ana' })
    return apiError(404, 'No encontrado')
  })
  vi.stubGlobal('fetch', fetchMock)

  function callsTo(method: string, path: string): ApiCall[] {
    return calls.filter((call) => call.method === method && call.path === path)
  }

  return {
    calls,
    callsTo,
    lastCallTo(method, path) {
      const matching = callsTo(method, path)
      const last = matching.at(-1)
      if (!last) throw new Error(`No ${method} ${path} request was made`)
      return last
    },
  }
}

/** Mounts the whole app (router, auth and layout) at `path` with a stored session. */
export function renderAppAt(path: string, options: { loggedIn?: boolean } = {}): RenderResult {
  if (options.loggedIn !== false) setToken('valid-token')
  return render(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(AuthProvider, null, createElement(AppRoutes))),
  )
}

// ---------- Fixtures ----------

export const COMIDA: Category = { id: 1, name: 'Comida', color: '#FF8A00' }
export const TRANSPORTE: Category = { id: 2, name: 'Transporte', color: '#2196F3' }

export function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 10,
    amount: 150.5,
    description: 'Almuerzo',
    date: '2026-11-15',
    category: COMIDA,
    tags: ['trabajo'],
    ...overrides,
  }
}

export function pageOf(content: Expense[], overrides: Partial<Page<Expense>> = {}): Page<Expense> {
  return {
    content,
    page: 0,
    size: 20,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    ...overrides,
  }
}

export function summary(period: Period, overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    period,
    from: '2026-11-01',
    to: '2026-11-30',
    totalSpent: 4850.5,
    previousTotal: 3200,
    changePercentage: 51.58,
    limit: null,
    byCategory: [
      { categoryId: 1, name: 'Comida', color: '#FF8A00', amount: 3350.5, percentage: 69.08 },
      { categoryId: 2, name: 'Transporte', color: '#2196F3', amount: 1500, percentage: 30.92 },
    ],
    breakdown: period === 'DAY' ? [] : [{ label: period === 'YEAR' ? '2026-11' : '2026-11-01', amount: 150 }],
    ...overrides,
  }
}
