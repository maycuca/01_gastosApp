import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthForm } from '../components/AuthForm'
import {
  apiError,
  COMIDA,
  expense,
  installApi,
  json,
  noContent,
  pageOf,
  renderAppAt,
  summary,
  TRANSPORTE,
} from '../test/fakeApi'
import type { ApiCall, ApiHandler } from '../test/fakeApi'
import { installNativeDialog } from '../test/nativeDialog'
import type { NativeDialogStub } from '../test/nativeDialog'
import type { LimitStatus, Period } from '../types/api'

// Every use of the Modal refuses to close while its request is in flight, and the keyboard
// focus never ends up on <body>: not after a failed request (the focused button was disabled
// while it was in flight) and not after the control that opened a confirmation disappears.

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  BarChart: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Bar: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}))

const TAXI = expense({ id: 11, amount: 80, description: 'Taxi', date: '2026-11-10', category: TRANSPORTE, tags: [] })
const WEEK_LIMIT: LimitStatus = { period: 'WEEK', limitAmount: 1000, spent: 200.5, remaining: 799.5, exceeded: false }
const OUTSIDE = { clientX: 5, clientY: 5 }

type User = ReturnType<typeof userEvent.setup>

function isMutation(call: ApiCall): boolean {
  return call.method !== 'GET'
}

/** Answers of the app with every mutation succeeding; `override` goes first. */
function appApi(override?: ApiHandler) {
  let expenseDeleted = false
  let limitDeleted = false
  return installApi((call) => {
    const overridden = override?.(call)
    if (overridden) return overridden
    if (call.path === '/api/categories' && call.method === 'GET') return json(200, [COMIDA, TRANSPORTE])
    if (call.path === '/api/categories' && call.method === 'POST') return json(201, { id: 99, ...(call.body as object) })
    if (call.path.startsWith('/api/categories/') && call.method === 'PUT') {
      return json(200, { id: COMIDA.id, ...(call.body as object) })
    }
    if (call.path === '/api/expenses' && call.method === 'GET') {
      return json(200, pageOf(expenseDeleted ? [TAXI] : [expense(), TAXI]))
    }
    if (call.path === '/api/expenses' && call.method === 'POST') {
      return json(201, { expense: expense({ id: 12 }), exceededLimits: [] })
    }
    if (call.path.startsWith('/api/expenses/') && call.method === 'PUT') {
      return json(200, { expense: expense(), exceededLimits: [] })
    }
    if (call.path.startsWith('/api/expenses/') && call.method === 'DELETE') {
      expenseDeleted = true
      return noContent()
    }
    if (call.path === '/api/limits' && call.method === 'GET') return json(200, limitDeleted ? [] : [WEEK_LIMIT])
    if (call.path.startsWith('/api/limits/') && call.method === 'PUT') {
      return json(200, { period: 'MONTH', limitAmount: 100, spent: 0, remaining: 100, exceeded: false })
    }
    if (call.path.startsWith('/api/limits/') && call.method === 'DELETE') {
      limitDeleted = true
      return noContent()
    }
    if (call.path === '/api/dashboard/summary') return json(200, summary(call.query.get('period') as Period))
    return undefined
  })
}

function deferredResponse() {
  let release: (response: Response) => void = () => {}
  const promise = new Promise<Response>((resolve) => {
    release = resolve
  })
  return { promise, release: (response: Response) => release(response) }
}

async function fillExpense(user: User, dialog: HTMLElement) {
  await user.type(await within(dialog).findByLabelText('Monto'), '150.50')
  await user.type(within(dialog).getByLabelText('Descripción'), 'Almuerzo')
  await user.selectOptions(within(dialog).getByLabelText('Categoría'), 'Comida')
}

interface Usage {
  name: string
  path: string
  opener: string
  dialog: string
  /** Fills what the form needs to pass its own validation. */
  fill?: (user: User, dialog: HTMLElement) => Promise<void>
  /** Button that sends the request. */
  send: string
}

const USAGES: Usage[] = [
  { name: 'dashboard: agregar gasto', path: '/', opener: 'Agregar gasto', dialog: 'Agregar gasto', fill: fillExpense, send: 'Agregar gasto' },
  { name: 'gastos: agregar gasto', path: '/gastos', opener: 'Agregar gasto', dialog: 'Agregar gasto', fill: fillExpense, send: 'Agregar gasto' },
  { name: 'gastos: editar gasto', path: '/gastos', opener: 'Editar Almuerzo', dialog: 'Editar gasto', send: 'Guardar cambios' },
  { name: 'gastos: eliminar gasto', path: '/gastos', opener: 'Eliminar Almuerzo', dialog: 'Eliminar gasto', send: 'Eliminar' },
  {
    name: 'categorías: nueva categoría',
    path: '/categorias',
    opener: 'Nueva categoría',
    dialog: 'Nueva categoría',
    fill: (user, dialog) => user.type(within(dialog).getByLabelText('Nombre'), 'Salud'),
    send: 'Crear categoría',
  },
  { name: 'categorías: editar categoría', path: '/categorias', opener: 'Editar Comida', dialog: 'Editar categoría', send: 'Guardar cambios' },
  { name: 'límites: quitar límite', path: '/limites', opener: 'Quitar límite de Semana', dialog: 'Quitar límite', send: 'Quitar' },
]

async function openDialog(user: User, usage: Pick<Usage, 'path' | 'opener' | 'dialog'>) {
  renderAppAt(usage.path)
  const opener = await screen.findByRole('button', { name: usage.opener })
  await waitFor(() => expect(opener).toBeEnabled())
  await user.click(opener)
  return screen.findByRole('dialog', { name: usage.dialog })
}

/** Opens the dialog of `usage` and sends its request, which stays in flight. */
async function sendAndHold(user: User, usage: Usage) {
  const held = deferredResponse()
  const api = appApi((call) => (isMutation(call) ? held.promise : undefined))
  const dialog = await openDialog(user, usage)
  await usage.fill?.(user, dialog)
  await user.click(within(dialog).getByRole('button', { name: usage.send }))
  await waitFor(() => expect(api.calls.filter(isMutation)).toHaveLength(1))
  return { api, dialog, held }
}

let native: NativeDialogStub

beforeEach(() => {
  native = installNativeDialog()
})

afterEach(() => {
  native.restore()
  vi.unstubAllGlobals()
})

describe.each(USAGES)('Modal in $name while its request is in flight', (usage) => {
  it('does not close with Esc, the close button, a click outside or a native close request', async () => {
    const user = userEvent.setup()
    const { api, dialog } = await sendAndHold(user, usage)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: usage.dialog })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByRole('dialog', { name: usage.dialog })).toBeInTheDocument()
    fireEvent.mouseDown(dialog, OUTSIDE)
    fireEvent.click(dialog, OUTSIDE)
    expect(screen.getByRole('dialog', { name: usage.dialog })).toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog', { name: usage.dialog })).toBeInTheDocument()

    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeDisabled()
    expect(dialog).toHaveAttribute('closedby', 'none')
    expect(api.calls.filter(isMutation)).toHaveLength(1)
  })

  it('shows the error in the dialog when the request fails, with the focus on its button, and can be closed again', async () => {
    const user = userEvent.setup()
    const { dialog, held } = await sendAndHold(user, usage)
    fireEvent.keyDown(dialog, { key: 'Escape' })

    held.release(apiError(500, 'No se pudo completar'))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No se pudo completar')
    const send = within(dialog).getByRole('button', { name: usage.send })
    expect(send).toBeEnabled()
    expect(send).toHaveFocus()
    expect(dialog).toHaveAttribute('closedby', 'any')
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeEnabled()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes on its own when the request succeeds', async () => {
    const user = userEvent.setup()
    const { api, held } = await sendAndHold(user, usage)
    const call = api.calls.filter(isMutation)[0]

    held.release(call.method === 'DELETE' ? noContent() : json(200, { expense: expense(), exceededLimits: [], ...COMIDA }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Focus after a request rejected by the server', () => {
  it('expense form: goes to the first field with an error', async () => {
    appApi((call) =>
      call.path === '/api/expenses' && call.method === 'POST'
        ? apiError(400, 'Datos inválidos', [
            { field: 'description', message: 'Descripción no permitida' },
            { field: 'categoryId', message: 'La categoría no existe' },
          ])
        : undefined,
    )
    const user = userEvent.setup()
    const dialog = await openDialog(user, USAGES[1])
    await fillExpense(user, dialog)

    await user.click(within(dialog).getByRole('button', { name: 'Agregar gasto' }))

    const description = within(dialog).getByLabelText('Descripción')
    await waitFor(() => expect(description).toHaveAccessibleDescription('Descripción no permitida'))
    expect(description).toHaveFocus()
  })

  it('category form: goes to the name when the server rejects it', async () => {
    appApi((call) =>
      call.path === '/api/categories' && call.method === 'POST'
        ? apiError(400, 'Datos inválidos', [{ field: 'name', message: 'Nombre no permitido' }])
        : undefined,
    )
    const user = userEvent.setup()
    const dialog = await openDialog(user, USAGES[4])
    await user.type(within(dialog).getByLabelText('Nombre'), 'Salud')

    await user.click(within(dialog).getByRole('button', { name: 'Crear categoría' }))

    const name = within(dialog).getByLabelText('Nombre')
    await waitFor(() => expect(name).toHaveAccessibleDescription('Nombre no permitido'))
    expect(name).toHaveFocus()
  })

  it('limit row: goes back to the amount', async () => {
    appApi((call) =>
      call.path.startsWith('/api/limits/') && call.method === 'PUT'
        ? apiError(400, 'Datos inválidos', [{ field: 'limitAmount', message: 'Monto demasiado grande' }])
        : undefined,
    )
    const user = userEvent.setup()
    renderAppAt('/limites')
    const edit = await screen.findByRole('button', { name: 'Fijar límite de Mes' })
    await waitFor(() => expect(edit).toBeEnabled())
    await user.click(edit)
    const amount = screen.getByLabelText('Límite para Mes')
    await user.type(amount, '999999')

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(amount).toHaveAccessibleDescription('Monto demasiado grande'))
    expect(amount).toHaveFocus()
  })

  it('register form: goes to the username when it is taken', async () => {
    installApi((call) =>
      call.path === '/api/auth/register'
        ? apiError(400, 'Datos inválidos', [{ field: 'username', message: 'Usuario no permitido' }])
        : undefined,
    )
    const user = userEvent.setup()
    renderAppAt('/registro', { loggedIn: false })
    await user.type(await screen.findByLabelText('Usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')

    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    const username = screen.getByLabelText('Usuario')
    await waitFor(() => expect(username).toHaveAccessibleDescription('Usuario no permitido'))
    expect(username).toHaveFocus()
  })

  it('login form: goes to the submit button when the error belongs to no field', async () => {
    let reject: (error: Error) => void = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail
        }),
    )
    const user = userEvent.setup()
    render(<AuthForm mode="login" onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Usuario'), 'ana')
    await user.type(screen.getByLabelText('Contraseña'), 'secreto-123')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()

    reject(new Error('Usuario o contraseña incorrectos'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos')
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toHaveFocus()
  })
})

describe('Focus after the control that opened a confirmation disappears', () => {
  it('gastos: goes to the page title after deleting an expense, and stays there once the row is gone', async () => {
    const api = appApi()
    const user = userEvent.setup()
    const dialog = await openDialog(user, USAGES[3])

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const title = screen.getByRole('heading', { level: 1, name: 'Gastos' })
    expect(title).toHaveFocus()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Eliminar Almuerzo' })).not.toBeInTheDocument())
    expect(api.callsTo('DELETE', '/api/expenses/10')).toHaveLength(1)
    expect(title).toHaveFocus()
    expect(document.body).not.toHaveFocus()
  })

  it('gastos: returns the focus to the opener when the deletion is cancelled', async () => {
    appApi()
    const user = userEvent.setup()
    const dialog = await openDialog(user, USAGES[3])

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('button', { name: 'Eliminar Almuerzo' })).toHaveFocus()
  })

  it('límites: goes to the heading of the period after removing its limit, and stays there once "Quitar" is gone', async () => {
    const api = appApi()
    const user = userEvent.setup()
    const dialog = await openDialog(user, USAGES[6])

    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const heading = screen.getByRole('heading', { level: 2, name: /^Semana/ })
    expect(heading).toHaveFocus()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Quitar límite de Semana' })).not.toBeInTheDocument(),
    )
    expect(api.callsTo('DELETE', '/api/limits/WEEK')).toHaveLength(1)
    expect(heading).toHaveFocus()
    // The next Tab continues from the row, not from the top of the page.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fijar límite de Semana' })).toBeEnabled())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Fijar límite de Semana' })).toHaveFocus()
  })
})
