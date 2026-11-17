import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiError, COMIDA, expense, installApi, json, noContent, pageOf, renderAppAt, TRANSPORTE } from '../test/fakeApi'
import type { ApiCall, ApiHandler } from '../test/fakeApi'
import type { ExceededLimit, Expense, Page } from '../types/api'
import { todayIsoDate } from '../utils/format'

const TAXI = expense({ id: 11, amount: 80, description: 'Taxi', date: '2026-11-10', category: TRANSPORTE, tags: [] })

interface ApiOptions {
  /** Page returned by `GET /api/expenses`; a function can look at the query. */
  list?: Page<Expense> | ((call: ApiCall) => Response)
  /** `exceededLimits` returned by POST and PUT. */
  exceededLimits?: ExceededLimit[]
  /** Overrides any route. */
  override?: ApiHandler
}

function expensesApi(options: ApiOptions = {}) {
  const list = options.list ?? pageOf([expense(), TAXI])
  return installApi((call) => {
    const overridden = options.override?.(call)
    if (overridden) return overridden
    if (call.path === '/api/categories') return json(200, [COMIDA, TRANSPORTE])
    if (call.path === '/api/expenses' && call.method === 'GET') {
      return typeof list === 'function' ? list(call) : json(200, list)
    }
    if (call.path === '/api/expenses' && call.method === 'POST') {
      return json(201, { expense: expense({ id: 12 }), exceededLimits: options.exceededLimits ?? [] })
    }
    if (call.path.startsWith('/api/expenses/') && call.method === 'PUT') {
      return json(200, { expense: expense(), exceededLimits: options.exceededLimits ?? [] })
    }
    if (call.path.startsWith('/api/expenses/') && call.method === 'DELETE') return noContent()
    return undefined
  })
}

async function openPage() {
  renderAppAt('/gastos')
  await screen.findByRole('heading', { name: 'Gastos', level: 1 })
}

function filters() {
  return within(screen.getByRole('form', { name: 'Filtros de gastos' }))
}

async function openAddDialog(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole('button', { name: 'Agregar gasto' })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  return within(await screen.findByRole('dialog', { name: 'Agregar gasto' }))
}

async function fillValidExpense(user: ReturnType<typeof userEvent.setup>, dialog: ReturnType<typeof within>) {
  await user.type(dialog.getByLabelText('Monto'), '150.50')
  await user.type(dialog.getByLabelText('Descripción'), 'Almuerzo')
  await user.selectOptions(dialog.getByLabelText('Categoría'), 'Comida')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ExpensesPage: list', () => {
  it('lists the expenses with date, description, category, tags and amount', async () => {
    const api = expensesApi()
    await openPage()

    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    // Header + 2 expenses, in the order the API returned them.
    expect(rows).toHaveLength(3)
    const almuerzo = within(rows[1])
    expect(almuerzo.getByText(/^15 nov\.? 2026$/)).toBeInTheDocument()
    expect(almuerzo.getByText('Almuerzo')).toBeInTheDocument()
    expect(almuerzo.getByText('Comida')).toBeInTheDocument()
    expect(almuerzo.getByText('trabajo')).toBeInTheDocument()
    expect(almuerzo.getByText('150.50')).toBeInTheDocument()
    const taxi = within(rows[2])
    expect(taxi.getByText('Taxi')).toBeInTheDocument()
    expect(taxi.getByText('Transporte')).toBeInTheDocument()
    expect(taxi.getByText('80.00')).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 1 · 2 gastos')).toBeInTheDocument()

    const request = api.lastCallTo('GET', '/api/expenses')
    expect(Object.fromEntries(request.query)).toEqual({ page: '0', size: '20' })
    expect(request.authorization).toBe('Bearer valid-token')
  })

  it('shows the category color next to its name', async () => {
    expensesApi()
    await openPage()

    const cell = (await screen.findByText('Transporte', { selector: 'td span' })).closest('td')
    expect(cell?.querySelector('.color-dot')).toHaveStyle({ backgroundColor: '#2196F3' })
  })

  it('shows the empty state when there are no expenses', async () => {
    expensesApi({ list: pageOf([]) })
    await openPage()

    expect(await screen.findByText('Aún no tienes gastos')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows a loading state while the list is requested', async () => {
    let respond: (response: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      respond = resolve
    })
    expensesApi({
      override: (call) => (call.method === 'GET' && call.path === '/api/expenses' ? pending : undefined),
    })
    await openPage()

    expect(await screen.findByText('Cargando gastos…')).toBeInTheDocument()
    respond(json(200, pageOf([expense()])))

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText('Cargando gastos…')).not.toBeInTheDocument()
  })

  it('shows the error state and retries', async () => {
    let fail = true
    const api = expensesApi({
      list: () => (fail ? apiError(500, 'Error interno del servidor') : json(200, pageOf([expense()]))),
    })
    const user = userEvent.setup()
    await openPage()

    expect(await screen.findByText('No se pudo cargar la información')).toBeInTheDocument()
    expect(screen.getByText('Error interno del servidor')).toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Almuerzo')).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/expenses')).toHaveLength(2)
  })

  it('requests the next and previous page', async () => {
    const api = expensesApi({
      list: (call) => {
        const page = Number(call.query.get('page'))
        return json(200, pageOf([page === 0 ? expense() : TAXI], { page, totalElements: 21, totalPages: 2 }))
      },
    })
    const user = userEvent.setup()
    await openPage()

    expect(await screen.findByText('Página 1 de 2 · 21 gastos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('Página 2 de 2 · 21 gastos')).toBeInTheDocument()
    expect(screen.getByText('Taxi')).toBeInTheDocument()
    expect(api.lastCallTo('GET', '/api/expenses').query.get('page')).toBe('1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled())

    await user.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByText('Página 1 de 2 · 21 gastos')).toBeInTheDocument()
    expect(api.lastCallTo('GET', '/api/expenses').query.get('page')).toBe('0')
  })
})

describe('ExpensesPage: filters', () => {
  it('sends every filter with the parameter names of the spec', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()
    await screen.findByRole('table')

    await user.type(filters().getByLabelText('Descripción'), 'almuerzo')
    await user.selectOptions(filters().getByLabelText('Categoría'), 'Transporte')
    await user.type(filters().getByLabelText('Desde'), '2026-11-01')
    await user.type(filters().getByLabelText('Hasta'), '2026-11-15')
    await user.type(filters().getByLabelText('Etiqueta'), '  Trabajo ')
    await user.click(filters().getByRole('button', { name: 'Filtrar' }))

    await waitFor(() => expect(api.callsTo('GET', '/api/expenses')).toHaveLength(2))
    expect(Object.fromEntries(api.lastCallTo('GET', '/api/expenses').query)).toEqual({
      description: 'almuerzo',
      categoryId: '2',
      startDate: '2026-11-01',
      endDate: '2026-11-15',
      tag: 'trabajo',
      page: '0',
      size: '20',
    })
  })

  it.each([
    ['Descripción', 'cine', { description: 'cine' }],
    ['Desde', '2026-11-10', { startDate: '2026-11-10' }],
    ['Hasta', '2026-11-10', { endDate: '2026-11-10' }],
    ['Etiqueta', 'viaje', { tag: 'viaje' }],
  ])('sends only the %s filter when it is the only one set', async (label, value, expected) => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()
    await screen.findByRole('table')

    await user.type(filters().getByLabelText(label), value)
    await user.click(filters().getByRole('button', { name: 'Filtrar' }))

    await waitFor(() => expect(api.callsTo('GET', '/api/expenses')).toHaveLength(2))
    expect(Object.fromEntries(api.lastCallTo('GET', '/api/expenses').query)).toEqual({
      ...expected,
      page: '0',
      size: '20',
    })
  })

  it('sends only the category filter when it is the only one set', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()
    await screen.findByRole('table')

    await user.selectOptions(filters().getByLabelText('Categoría'), 'Comida')
    await user.click(filters().getByRole('button', { name: 'Filtrar' }))

    await waitFor(() => expect(api.callsTo('GET', '/api/expenses')).toHaveLength(2))
    expect(Object.fromEntries(api.lastCallTo('GET', '/api/expenses').query)).toEqual({
      categoryId: '1',
      page: '0',
      size: '20',
    })
  })

  it('clears the filters and goes back to the first page', async () => {
    const api = expensesApi({
      list: (call) => {
        const page = Number(call.query.get('page'))
        return json(200, pageOf([expense()], { page, totalElements: 21, totalPages: 2 }))
      },
    })
    const user = userEvent.setup()
    await openPage()
    await user.click(await screen.findByRole('button', { name: 'Siguiente' }))
    await screen.findByText('Página 2 de 2 · 21 gastos')

    await user.type(filters().getByLabelText('Descripción'), 'almuerzo')
    await user.click(filters().getByRole('button', { name: 'Filtrar' }))
    await waitFor(() =>
      expect(Object.fromEntries(api.lastCallTo('GET', '/api/expenses').query)).toEqual({
        description: 'almuerzo',
        page: '0',
        size: '20',
      }),
    )

    await waitFor(() => expect(filters().getByRole('button', { name: 'Limpiar' })).toBeEnabled())
    await user.click(filters().getByRole('button', { name: 'Limpiar' }))

    await waitFor(() =>
      expect(Object.fromEntries(api.lastCallTo('GET', '/api/expenses').query)).toEqual({ page: '0', size: '20' }),
    )
    expect(filters().getByLabelText('Descripción')).toHaveValue('')
  })

  it('does not call the API when the date range is inverted', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()
    await screen.findByRole('table')

    await user.type(filters().getByLabelText('Desde'), '2026-11-15')
    await user.type(filters().getByLabelText('Hasta'), '2026-11-01')
    await user.click(filters().getByRole('button', { name: 'Filtrar' }))

    expect(screen.getByText('La fecha inicial no puede ser posterior a la fecha final')).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/expenses')).toHaveLength(1)
  })

  it('explains that no expense matches the filters', async () => {
    expensesApi({
      list: (call) => json(200, pageOf(call.query.has('description') ? [] : [expense()])),
    })
    const user = userEvent.setup()
    await openPage()
    await screen.findByRole('table')

    await user.type(filters().getByLabelText('Descripción'), 'nada')
    await user.click(filters().getByRole('button', { name: 'Filtrar' }))

    expect(await screen.findByText('Ningún gasto coincide con los filtros')).toBeInTheDocument()
  })
})

describe('ExpensesPage: add', () => {
  it('adds an expense with amount, description, date, category and tags', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    expect(dialog.getByLabelText('Fecha')).toHaveValue(todayIsoDate())
    await user.type(dialog.getByLabelText('Etiquetas (opcional)'), ' Trabajo {Enter}')
    await user.type(dialog.getByLabelText('Etiquetas (opcional)'), 'viaje')
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))

    expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.lastCallTo('POST', '/api/expenses').body).toEqual({
      amount: 150.5,
      description: 'Almuerzo',
      date: todayIsoDate(),
      categoryId: 1,
      tags: ['trabajo', 'viaje'],
    })
    // The list is requested again after saving.
    await waitFor(() => expect(api.callsTo('GET', '/api/expenses')).toHaveLength(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lets the user choose a past date and sends it as YYYY-MM-DD', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.clear(dialog.getByLabelText('Fecha'))
    await user.type(dialog.getByLabelText('Fecha'), '2026-01-05')
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))

    await screen.findByText('Gasto agregado.')
    expect(api.lastCallTo('POST', '/api/expenses').body).toMatchObject({ date: '2026-01-05', tags: [] })
  })

  it('validates before calling the API', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))

    expect(dialog.getByText('Escribe el monto')).toBeInTheDocument()
    expect(dialog.getByText('Escribe una descripción')).toBeInTheDocument()
    expect(dialog.getByText('Elige una categoría')).toBeInTheDocument()

    await user.type(dialog.getByLabelText('Monto'), '0')
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))
    expect(dialog.getByText('Debe ser mayor a 0')).toBeInTheDocument()

    await user.clear(dialog.getByLabelText('Monto'))
    await user.type(dialog.getByLabelText('Monto'), '10.555')
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))
    expect(dialog.getByText('Escribe un número con máximo 2 decimales')).toBeInTheDocument()

    expect(api.callsTo('POST', '/api/expenses')).toHaveLength(0)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('rejects a future date before calling the API', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.clear(dialog.getByLabelText('Fecha'))
    await user.type(dialog.getByLabelText('Fecha'), '2999-01-01')
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))

    expect(dialog.getByText('La fecha no puede ser futura')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/expenses')).toHaveLength(0)
  })

  it('shows the backend fieldErrors next to their fields and keeps the form open', async () => {
    const api = expensesApi({
      override: (call) =>
        call.method === 'POST' && call.path === '/api/expenses'
          ? apiError(400, 'Datos inválidos', [
              { field: 'amount', message: 'Debe ser mayor a 0' },
              { field: 'description', message: 'Campo obligatorio' },
              { field: 'date', message: 'No puede ser una fecha futura' },
              { field: 'categoryId', message: 'Campo obligatorio' },
              { field: 'tags[0]', message: 'Cada etiqueta debe tener entre 1 y 30 caracteres' },
            ])
          : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))

    await waitFor(() => expect(api.callsTo('POST', '/api/expenses')).toHaveLength(1))
    const expected: [string, string][] = [
      ['Monto', 'Debe ser mayor a 0'],
      ['Descripción', 'Campo obligatorio'],
      ['Fecha', 'No puede ser una fecha futura'],
      ['Categoría', 'Campo obligatorio'],
      ['Etiquetas (opcional)', 'Cada etiqueta debe tener entre 1 y 30 caracteres'],
    ]
    for (const [label, message] of expected) {
      const input = await dialog.findByLabelText(label)
      // The message is tied to the control and rendered inside the same field block.
      expect(input).toHaveAccessibleDescription(message)
      const field = input.closest('.field')
      expect(field).toHaveClass('field-invalid')
      expect(within(field as HTMLElement).getByText(message)).toBeInTheDocument()
    }
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('Gasto agregado.')).not.toBeInTheDocument()
    // Values typed by the user are kept.
    expect(dialog.getByLabelText('Monto')).toHaveValue('150.50')
    expect(dialog.getByLabelText('Descripción')).toHaveValue('Almuerzo')
  })

  it('shows errors that do not belong to a field as a general message', async () => {
    expensesApi({
      override: (call) =>
        call.method === 'POST' && call.path === '/api/expenses' ? apiError(404, 'Categoría no encontrada') : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))

    expect(await dialog.findByText('Categoría no encontrada')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes the form without saving on cancel', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.callsTo('POST', '/api/expenses')).toHaveLength(0)
  })
})

describe('ExpensesPage: edit', () => {
  async function openEditDialog(user: ReturnType<typeof userEvent.setup>) {
    const button = await screen.findByRole('button', { name: 'Editar Almuerzo' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    return within(await screen.findByRole('dialog', { name: 'Editar gasto' }))
  }

  it('shows the current values and the date as read-only', async () => {
    expensesApi()
    const user = userEvent.setup()
    await openPage()

    const dialog = await openEditDialog(user)

    expect(dialog.getByLabelText('Monto')).toHaveValue('150.50')
    expect(dialog.getByLabelText('Descripción')).toHaveValue('Almuerzo')
    expect(dialog.getByLabelText('Categoría')).toHaveValue('1')
    expect(dialog.getByText('trabajo')).toBeInTheDocument()
    const date = dialog.getByLabelText('Fecha')
    expect(date).toHaveAttribute('readonly')
    expect(date).not.toHaveAttribute('type', 'date')
    expect((date as HTMLInputElement).value).toMatch(/^15 nov\.? 2026$/)
    // Typing has no effect on a read-only control.
    await user.type(date, '2020-01-01')
    expect((date as HTMLInputElement).value).toMatch(/^15 nov\.? 2026$/)
  })

  it('sends amount, description, category and tags, and never the date', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()

    const dialog = await openEditDialog(user)
    await user.clear(dialog.getByLabelText('Monto'))
    await user.type(dialog.getByLabelText('Monto'), '80.25')
    await user.clear(dialog.getByLabelText('Descripción'))
    await user.type(dialog.getByLabelText('Descripción'), 'Taxi al aeropuerto')
    await user.selectOptions(dialog.getByLabelText('Categoría'), 'Transporte')
    await user.click(dialog.getByRole('button', { name: 'Quitar etiqueta trabajo' }))
    await user.type(dialog.getByLabelText('Etiquetas (opcional)'), 'viaje{Enter}')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Gasto actualizado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const body = api.lastCallTo('PUT', '/api/expenses/10').body
    expect(body).toEqual({ amount: 80.25, description: 'Taxi al aeropuerto', categoryId: 2, tags: ['viaje'] })
    expect(body).not.toHaveProperty('date')
    await waitFor(() => expect(api.callsTo('GET', '/api/expenses')).toHaveLength(2))
  })

  it('shows the backend fieldErrors next to their fields', async () => {
    expensesApi({
      override: (call) =>
        call.method === 'PUT'
          ? apiError(400, 'Datos inválidos', [{ field: 'amount', message: 'Debe ser mayor a 0' }])
          : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    const dialog = await openEditDialog(user)
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(dialog.getByLabelText('Monto')).toHaveAccessibleDescription('Debe ser mayor a 0'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('Gasto actualizado.')).not.toBeInTheDocument()
  })
})

describe('ExpensesPage: delete', () => {
  it('asks for confirmation before deleting', async () => {
    const api = expensesApi()
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Eliminar Almuerzo' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Eliminar gasto' }))
    expect(dialog.getByText('Almuerzo')).toBeInTheDocument()
    expect(dialog.getByText('150.50')).toBeInTheDocument()
    expect(dialog.getByText('Esta acción es definitiva.')).toBeInTheDocument()
    expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)

    await user.click(dialog.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.calls.filter((call) => call.method === 'DELETE')).toHaveLength(0)
    expect(screen.getByText('Almuerzo')).toBeInTheDocument()
  })

  it('deletes after confirming and reloads the list', async () => {
    let deleted = false
    const api = expensesApi({
      list: () => json(200, pageOf(deleted ? [TAXI] : [expense(), TAXI])),
      override: (call) => {
        if (call.method === 'DELETE' && call.path === '/api/expenses/10') {
          deleted = true
          return noContent()
        }
        return undefined
      },
    })
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Eliminar Almuerzo' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Eliminar gasto' }))
    await user.click(dialog.getByRole('button', { name: 'Eliminar' }))

    expect(await screen.findByText('Gasto eliminado.')).toBeInTheDocument()
    expect(api.callsTo('DELETE', '/api/expenses/10')).toHaveLength(1)
    await waitFor(() => expect(screen.queryByText('Almuerzo')).not.toBeInTheDocument())
    expect(screen.getByText('Taxi')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the confirmation open and shows the error when deleting fails', async () => {
    expensesApi({
      override: (call) => (call.method === 'DELETE' ? apiError(404, 'Gasto no encontrado') : undefined),
    })
    const user = userEvent.setup()
    await openPage()

    await user.click(await screen.findByRole('button', { name: 'Eliminar Almuerzo' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Eliminar gasto' }))
    await user.click(dialog.getByRole('button', { name: 'Eliminar' }))

    expect(await dialog.findByText('Gasto no encontrado')).toBeInTheDocument()
    expect(screen.queryByText('Gasto eliminado.')).not.toBeInTheDocument()
  })
})

describe('ExpensesPage: exceeded limits', () => {
  const MONTH: ExceededLimit = { period: 'MONTH', limitAmount: 5000, spent: 5120 }
  const WEEK: ExceededLimit = { period: 'WEEK', limitAmount: 1000, spent: 1200.5 }

  it('names the exceeded periods after adding an expense', async () => {
    expensesApi({ exceededLimits: [WEEK, MONTH] })
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Límites excedidos: Semana, Mes.')
    expect(alert).toHaveTextContent('El gasto se guardó de todas formas.')
    expect(alert).toHaveTextContent('Semana: gastado 1,200.50 de un límite de 1,000.00')
    expect(alert).toHaveTextContent('Mes: gastado 5,120.00 de un límite de 5,000.00')
    // The expense was saved anyway.
    expect(screen.getByText('Gasto agregado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names the exceeded period after editing an expense', async () => {
    expensesApi({ exceededLimits: [MONTH] })
    const user = userEvent.setup()
    await openPage()

    const edit = await screen.findByRole('button', { name: 'Editar Almuerzo' })
    await waitFor(() => expect(edit).toBeEnabled())
    await user.click(edit)
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar gasto' }))
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Límite excedido: Mes.')
    expect(screen.getByText('Gasto actualizado.')).toBeInTheDocument()
  })

  it.each([
    ['DAY', 'Día'],
    ['WEEK', 'Semana'],
    ['FORTNIGHT', 'Quincena'],
    ['MONTH', 'Mes'],
    ['YEAR', 'Año'],
  ] as const)('names the %s period as %s', async (period, name) => {
    expensesApi({ exceededLimits: [{ period, limitAmount: 10, spent: 11 }] })
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(`Límite excedido: ${name}.`)
  })

  it('removes the alert when a later edit leaves no limit exceeded', async () => {
    let exceededLimits: ExceededLimit[] = [MONTH]
    expensesApi({
      override: (call) =>
        call.method === 'PUT' ? json(200, { expense: expense(), exceededLimits }) : undefined,
    })
    const user = userEvent.setup()
    await openPage()

    const edit = await screen.findByRole('button', { name: 'Editar Almuerzo' })
    await waitFor(() => expect(edit).toBeEnabled())
    await user.click(edit)
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Editar gasto' })).getByRole('button', {
        name: 'Guardar cambios',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Límite excedido: Mes.')

    exceededLimits = []
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar Almuerzo' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Editar Almuerzo' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Editar gasto' })).getByRole('button', {
        name: 'Guardar cambios',
      }),
    )

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByText('Gasto actualizado.')).toBeInTheDocument()
  })

  it('removes the alert after deleting an expense', async () => {
    expensesApi({ exceededLimits: [MONTH] })
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Límite excedido: Mes.')

    await user.click(screen.getByRole('button', { name: 'Eliminar Almuerzo' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Eliminar gasto' })).getByRole('button', { name: 'Eliminar' }),
    )

    expect(await screen.findByText('Gasto eliminado.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lets the user dismiss the alert', async () => {
    expensesApi({ exceededLimits: [MONTH] })
    const user = userEvent.setup()
    await openPage()

    const dialog = await openAddDialog(user)
    await fillValidExpense(user, dialog)
    await user.click(dialog.getByRole('button', { name: 'Agregar gasto' }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Cerrar alerta' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
