import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, installApi, json, noContent, renderAppAt, summary } from '../test/fakeApi'
import type { ApiHandler } from '../test/fakeApi'
import type { LimitStatus, Period } from '../types/api'

const MONTH_EXCEEDED: LimitStatus = {
  period: 'MONTH',
  limitAmount: 5000,
  spent: 5120,
  remaining: -120,
  exceeded: true,
}
const WEEK_OK: LimitStatus = { period: 'WEEK', limitAmount: 1000, spent: 200.5, remaining: 799.5, exceeded: false }

const SPENT_WITHOUT_LIMIT: Record<Period, number> = { DAY: 12.5, WEEK: 200.5, FORTNIGHT: 340, MONTH: 5120, YEAR: 9000 }

function limitsApi(options: { limits?: LimitStatus[]; override?: ApiHandler } = {}) {
  let limits = options.limits ?? [WEEK_OK, MONTH_EXCEEDED]
  return installApi((call) => {
    const overridden = options.override?.(call)
    if (overridden) return overridden
    if (call.path === '/api/limits' && call.method === 'GET') return json(200, limits)
    if (call.path === '/api/dashboard/summary') {
      const period = call.query.get('period') as Period
      return json(200, summary(period, { totalSpent: SPENT_WITHOUT_LIMIT[period] }))
    }
    if (call.path.startsWith('/api/limits/') && call.method === 'PUT') {
      const period = call.path.split('/').pop() as Period
      const { limitAmount } = call.body as { limitAmount: number }
      const spent = SPENT_WITHOUT_LIMIT[period]
      const saved: LimitStatus = {
        period,
        limitAmount,
        spent,
        remaining: Math.round((limitAmount - spent) * 100) / 100,
        exceeded: spent > limitAmount,
      }
      limits = [...limits.filter((limit) => limit.period !== period), saved]
      return json(200, saved)
    }
    if (call.path.startsWith('/api/limits/') && call.method === 'DELETE') {
      const period = call.path.split('/').pop()
      limits = limits.filter((limit) => limit.period !== period)
      return noContent()
    }
    return undefined
  })
}

async function openPage() {
  renderAppAt('/limites')
  await screen.findByRole('heading', { name: 'Límites', level: 1 })
}

/** The row (list item) of a period, found by its heading. */
async function row(name: string) {
  const heading = await screen.findByRole('heading', { level: 2, name: new RegExp(`^${name}`) })
  const item = heading.closest('li')
  if (!item) throw new Error(`Row ${name} is not a list item`)
  return item
}

function figure(item: HTMLElement, term: string): HTMLElement {
  const dt = within(item).getByText(term, { selector: 'dt' })
  const dd = dt.nextElementSibling
  if (!(dd instanceof HTMLElement)) throw new Error(`No value for ${term}`)
  return dd
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('LimitsPage: rows', () => {
  it('shows one row per period, in order, with spent, limit and remaining', async () => {
    limitsApi()
    await openPage()

    await row('Día')
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(headings).toEqual(['Día', 'Semana', 'Quincena', 'MesExcedido', 'Año'])
    expect(within(screen.getByRole('main')).getAllByRole('listitem')).toHaveLength(5)

    const week = await row('Semana')
    expect(figure(week, 'Gastado')).toHaveTextContent('200.50')
    expect(figure(week, 'Límite')).toHaveTextContent('1,000.00')
    expect(figure(week, 'Restante')).toHaveTextContent('799.50')
    expect(within(week).getByRole('button', { name: 'Cambiar límite de Semana' })).toBeInTheDocument()
    expect(within(week).getByRole('button', { name: 'Quitar límite de Semana' })).toBeInTheDocument()
  })

  it('shows the periods without a limit with what was spent and the option to set one', async () => {
    const api = limitsApi()
    await openPage()

    const day = await row('Día')
    expect(figure(day, 'Gastado')).toHaveTextContent('12.50')
    expect(figure(day, 'Límite')).toHaveTextContent('Sin límite')
    expect(figure(day, 'Restante')).toHaveTextContent('—')
    expect(within(day).getByRole('button', { name: 'Fijar límite de Día' })).toBeInTheDocument()
    expect(within(day).queryByRole('button', { name: /Quitar/ })).not.toBeInTheDocument()
    expect(figure(await row('Quincena'), 'Gastado')).toHaveTextContent('340.00')
    expect(figure(await row('Año'), 'Gastado')).toHaveTextContent('9,000.00')

    // Only the periods without a limit need the dashboard summary.
    const requested = api.callsTo('GET', '/api/dashboard/summary').map((call) => call.query.get('period'))
    expect(requested.sort()).toEqual(['DAY', 'FORTNIGHT', 'YEAR'])
  })

  it('marks an exceeded limit', async () => {
    limitsApi()
    await openPage()

    const month = await row('Mes')
    expect(within(month).getByText('Excedido')).toBeInTheDocument()
    expect(month).toHaveClass('limit-row-exceeded')
    expect(figure(month, 'Gastado')).toHaveTextContent('5,120.00')
    expect(figure(month, 'Gastado')).toHaveClass('text-danger')
    expect(figure(month, 'Límite')).toHaveTextContent('5,000.00')
    expect(figure(month, 'Restante')).toHaveTextContent('-120.00')
    expect(figure(month, 'Restante')).toHaveClass('text-danger')

    const week = await row('Semana')
    expect(within(week).queryByText('Excedido')).not.toBeInTheDocument()
    expect(week).not.toHaveClass('limit-row-exceeded')
    expect(figure(week, 'Gastado')).not.toHaveClass('text-danger')
    expect(figure(week, 'Restante')).not.toHaveClass('text-danger')
  })

  it('does not mark a limit that is exactly reached', async () => {
    limitsApi({ limits: [{ period: 'DAY', limitAmount: 100, spent: 100, remaining: 0, exceeded: false }] })
    await openPage()

    const day = await row('Día')
    expect(within(day).queryByText('Excedido')).not.toBeInTheDocument()
    expect(figure(day, 'Restante')).toHaveTextContent('0.00')
    expect(figure(day, 'Restante')).not.toHaveClass('text-danger')
  })

  it('shows the empty state and still one row per period when there are no limits', async () => {
    limitsApi({ limits: [] })
    await openPage()

    expect(await screen.findByText('Aún no has fijado ningún límite')).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getAllByRole('button', { name: /^Fijar límite de / })).toHaveLength(5)
  })

  it('shows the error state and retries', async () => {
    let fail = true
    limitsApi({
      override: (call) =>
        call.path === '/api/limits' && fail ? apiError(500, 'Error interno del servidor') : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    expect(await screen.findByText('No se pudo cargar la información')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await row('Mes')).toBeInTheDocument()
  })
})

describe('LimitsPage: set, change and remove', () => {
  it('sets a limit for a period that had none', async () => {
    const api = limitsApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Fijar límite de Día' }))
    const input = screen.getByLabelText('Límite para Día')
    expect(input).toHaveValue('')
    await user.type(input, '300')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.callsTo('PUT', '/api/limits/DAY')).toHaveLength(1))
    expect(api.lastCallTo('PUT', '/api/limits/DAY').body).toEqual({ limitAmount: 300 })
    // The list is reloaded and the row now shows the limit and its remaining amount.
    await waitFor(async () => expect(figure(await row('Día'), 'Límite')).toHaveTextContent('300.00'))
    expect(figure(await row('Día'), 'Restante')).toHaveTextContent('287.50')
    expect(await screen.findByRole('button', { name: 'Cambiar límite de Día' })).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/limits')).toHaveLength(2)
  })

  it('changes an existing limit starting from its current amount', async () => {
    const api = limitsApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Cambiar límite de Mes' }))
    const input = screen.getByLabelText('Límite para Mes')
    expect(input).toHaveValue('5000.00')
    await user.clear(input)
    await user.type(input, '6000.50')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.callsTo('PUT', '/api/limits/MONTH')).toHaveLength(1))
    expect(api.lastCallTo('PUT', '/api/limits/MONTH').body).toEqual({ limitAmount: 6000.5 })
    await waitFor(async () => expect(figure(await row('Mes'), 'Límite')).toHaveTextContent('6,000.50'))
    // With the new limit the period is no longer exceeded.
    await waitFor(async () => expect(within(await row('Mes')).queryByText('Excedido')).not.toBeInTheDocument())
  })

  it('removes a limit after confirming', async () => {
    const api = limitsApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Quitar límite de Semana' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Quitar límite' }))
    expect(dialog.getByText('Semana')).toBeInTheDocument()
    expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)
    await user.click(dialog.getByRole('button', { name: 'Quitar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('DELETE', '/api/limits/WEEK')).toHaveLength(1)
    await waitFor(async () => expect(figure(await row('Semana'), 'Límite')).toHaveTextContent('Sin límite'))
    expect(await screen.findByRole('button', { name: 'Fijar límite de Semana' })).toBeInTheDocument()
  })

  it('does not remove the limit when the confirmation is cancelled', async () => {
    const api = limitsApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Quitar límite de Semana' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Quitar límite' }))
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)
    expect(figure(await row('Semana'), 'Límite')).toHaveTextContent('1,000.00')
  })

  it.each([
    ['0', 'Debe ser mayor a 0'],
    ['abc', 'Escribe un número con máximo 2 decimales'],
    ['10.555', 'Escribe un número con máximo 2 decimales'],
    ['-5', 'Escribe un número con máximo 2 decimales'],
  ])('rejects the amount "%s" before calling the API', async (typed, message) => {
    const api = limitsApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Fijar límite de Día' }))
    await user.type(screen.getByLabelText('Límite para Día'), typed)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByLabelText('Límite para Día')).toHaveAccessibleDescription(message)
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
  })

  it('shows the backend fieldErrors next to the amount', async () => {
    limitsApi({
      override: (call) =>
        call.method === 'PUT'
          ? apiError(400, 'Datos inválidos', [{ field: 'limitAmount', message: 'Debe ser mayor a 0' }])
          : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Fijar límite de Año' }))
    await user.type(screen.getByLabelText('Límite para Año'), '10')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Límite para Año')).toHaveAccessibleDescription('Debe ser mayor a 0'),
    )
  })

  it('cancels the edition without calling the API', async () => {
    const api = limitsApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Cambiar límite de Mes' }))
    await user.clear(screen.getByLabelText('Límite para Mes'))
    await user.type(screen.getByLabelText('Límite para Mes'), '1')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByLabelText('Límite para Mes')).not.toBeInTheDocument()
    expect(api.calls.filter((call) => call.method === 'PUT')).toHaveLength(0)
    expect(figure(await row('Mes'), 'Límite')).toHaveTextContent('5,000.00')
  })
})

describe('LimitsPage: focus after the inline form closes', () => {
  it('after saving, the focus goes to the heading of the same row and stays there through the reload', async () => {
    let releaseReload: () => void = () => {}
    let reloads = 0
    const api = limitsApi({
      override: (call) => {
        if (call.path !== '/api/limits' || call.method !== 'GET') return undefined
        reloads += 1
        if (reloads < 2) return undefined
        // Hold the reload so the moment when "Cambiar" is disabled can be checked.
        return new Promise<Response>((resolve) => {
          releaseReload = () => resolve(json(200, [WEEK_OK, { ...MONTH_EXCEEDED, limitAmount: 6000, remaining: 880, exceeded: false }]))
        })
      },
    })
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Cambiar límite de Mes' }))
    const input = screen.getByLabelText('Límite para Mes')
    await user.clear(input)
    await user.type(input, '6000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.callsTo('PUT', '/api/limits/MONTH')).toHaveLength(1))
    const heading = screen.getByRole('heading', { level: 2, name: /^Mes/ })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.queryByLabelText('Límite para Mes')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar límite de Mes' })).toBeDisabled()
    expect(document.body).not.toHaveFocus()

    releaseReload()
    await waitFor(async () => expect(figure(await row('Mes'), 'Límite')).toHaveTextContent('6,000.00'))
    expect(screen.getByRole('button', { name: 'Cambiar límite de Mes' })).toBeEnabled()
    expect(screen.getByRole('heading', { level: 2, name: /^Mes/ })).toHaveFocus()
  })

  it('after setting a first limit, the focus goes to the heading of that row', async () => {
    limitsApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Fijar límite de Día' }))
    await user.type(screen.getByLabelText('Límite para Día'), '300')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: /^Día/ })).toHaveFocus())
    expect(await screen.findByRole('button', { name: 'Cambiar límite de Día' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /^Día/ })).toHaveFocus()
  })

  it('after cancelling, the focus returns to the button that opened the form', async () => {
    limitsApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Cambiar límite de Semana' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Cambiar límite de Semana' })).toHaveFocus()
  })

  it('keeps the focus on the field when the save fails', async () => {
    limitsApi({ override: (call) => (call.method === 'PUT' ? apiError(500, 'Error interno del servidor') : undefined) })
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Fijar límite de Año' }))
    await user.type(screen.getByLabelText('Límite para Año'), '10')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Error interno del servidor')).toBeInTheDocument()
    expect(screen.getByLabelText('Límite para Año')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /^Año/ })).not.toHaveFocus()
  })
})
