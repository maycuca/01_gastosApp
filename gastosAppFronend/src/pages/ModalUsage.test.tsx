import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import type { ApiHandler } from '../test/fakeApi'
import { installNativeDialog } from '../test/nativeDialog'
import type { NativeDialogStub } from '../test/nativeDialog'
import type { LimitStatus, Period } from '../types/api'

// Second QA round: every use of the Modal (native <dialog>) from the pages.
// jsdom has no showModal(); `installNativeDialog` stands in for it (see src/test/nativeDialog.ts),
// so "the focus returns to the opener" checks that the dialog is closed while it is still in the
// document and that the opener is still there and enabled. The focus trap, the inert page behind
// and the native `closedby` light dismiss cannot be exercised in jsdom.

// jsdom has no layout, so Recharts cannot draw; the charts are not under test here.
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

function appApi(override?: ApiHandler) {
  return installApi((call) => {
    const overridden = override?.(call)
    if (overridden) return overridden
    if (call.path === '/api/categories' && call.method === 'GET') return json(200, [COMIDA, TRANSPORTE])
    if (call.path === '/api/categories' && call.method === 'POST') return json(201, { id: 99, ...(call.body as object) })
    if (call.path.startsWith('/api/categories/') && call.method === 'PUT') {
      return json(200, { id: COMIDA.id, ...(call.body as object) })
    }
    if (call.path === '/api/expenses' && call.method === 'GET') return json(200, pageOf([expense(), TAXI]))
    if (call.path === '/api/expenses' && call.method === 'POST') {
      return json(201, { expense: expense({ id: 12 }), exceededLimits: [] })
    }
    if (call.path.startsWith('/api/expenses/') && call.method === 'PUT') {
      return json(200, { expense: expense(), exceededLimits: [] })
    }
    if (call.path.startsWith('/api/expenses/') && call.method === 'DELETE') return noContent()
    if (call.path === '/api/limits' && call.method === 'GET') return json(200, [WEEK_LIMIT])
    if (call.path.startsWith('/api/limits/') && call.method === 'DELETE') return noContent()
    if (call.path === '/api/dashboard/summary') return json(200, summary(call.query.get('period') as Period))
    return undefined
  })
}

/** A response that the test releases when it wants, to keep a request in flight. */
function deferredResponse() {
  let release: (response: Response) => void = () => {}
  const promise = new Promise<Response>((resolve) => {
    release = resolve
  })
  return { promise, release: (response: Response) => release(response) }
}

interface Usage {
  name: string
  path: string
  /** Accessible name of the control that opens the dialog. */
  opener: string
  dialog: string
  /** Control that must have the focus once the dialog is ready. */
  focus: { label: string } | { button: string }
}

const USAGES: Usage[] = [
  { name: 'dashboard: agregar gasto', path: '/', opener: 'Agregar gasto', dialog: 'Agregar gasto', focus: { label: 'Monto' } },
  { name: 'gastos: agregar gasto', path: '/gastos', opener: 'Agregar gasto', dialog: 'Agregar gasto', focus: { label: 'Monto' } },
  { name: 'gastos: editar gasto', path: '/gastos', opener: 'Editar Almuerzo', dialog: 'Editar gasto', focus: { label: 'Monto' } },
  { name: 'gastos: eliminar gasto', path: '/gastos', opener: 'Eliminar Almuerzo', dialog: 'Eliminar gasto', focus: { button: 'Cancelar' } },
  { name: 'categorías: nueva categoría', path: '/categorias', opener: 'Nueva categoría', dialog: 'Nueva categoría', focus: { label: 'Nombre' } },
  { name: 'categorías: editar categoría', path: '/categorias', opener: 'Editar Comida', dialog: 'Editar categoría', focus: { label: 'Nombre' } },
  { name: 'límites: quitar límite', path: '/limites', opener: 'Quitar límite de Semana', dialog: 'Quitar límite', focus: { button: 'Cancelar' } },
]

async function findOpener(usage: Usage) {
  const opener = await screen.findByRole('button', { name: usage.opener })
  await waitFor(() => expect(opener).toBeEnabled())
  return opener
}

async function openDialog(user: User, usage: Usage) {
  renderAppAt(usage.path)
  const opener = await findOpener(usage)
  await user.click(opener)
  const dialog = await screen.findByRole('dialog', { name: usage.dialog })
  const focusTarget =
    'label' in usage.focus
      ? await within(dialog).findByLabelText(usage.focus.label)
      : await within(dialog).findByRole('button', { name: usage.focus.button })
  return { dialog, focusTarget }
}

function mutations(api: ReturnType<typeof appApi>) {
  return api.calls.filter((call) => call.method !== 'GET')
}

let native: NativeDialogStub

beforeEach(() => {
  native = installNativeDialog()
})

afterEach(() => {
  native.restore()
  vi.unstubAllGlobals()
})

describe.each(USAGES)('Modal in $name', (usage) => {
  it('opens as a modal dialog with the focus on its first useful control', async () => {
    appApi()
    const user = userEvent.setup()

    const { dialog, focusTarget } = await openDialog(user, usage)

    expect(native.calls).toEqual(['showModal'])
    expect(dialog).toHaveAttribute('open')
    expect(focusTarget).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('closes with Esc without calling the API and returns the focus to the opener', async () => {
    const api = appApi()
    const user = userEvent.setup()
    await openDialog(user, usage)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutations(api)).toHaveLength(0)
    expect(await findOpener(usage)).toHaveFocus()
    expect(native.calls).toEqual(['showModal', 'close:connected'])
  })

  it('closes with a click outside without calling the API and returns the focus to the opener', async () => {
    const api = appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, usage)

    fireEvent.mouseDown(dialog, OUTSIDE)
    fireEvent.click(dialog, OUTSIDE)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutations(api)).toHaveLength(0)
    expect(await findOpener(usage)).toHaveFocus()
  })

  it('closes with the Cerrar button and returns the focus to the opener', async () => {
    const api = appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, usage)

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutations(api)).toHaveLength(0)
    expect(await findOpener(usage)).toHaveFocus()
  })

  it('stays open when a press that started inside ends outside', async () => {
    appApi()
    const user = userEvent.setup()
    const { dialog, focusTarget } = await openDialog(user, usage)

    fireEvent.mouseDown(focusTarget, OUTSIDE)
    fireEvent.click(dialog, OUTSIDE)

    expect(screen.getByRole('dialog', { name: usage.dialog })).toBeInTheDocument()
  })

  it('opens again after closing, with the focus inside once more', async () => {
    appApi()
    const user = userEvent.setup()
    await openDialog(user, usage)
    await user.keyboard('{Escape}')

    await user.click(await findOpener(usage))
    const dialog = await screen.findByRole('dialog', { name: usage.dialog })

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    expect(native.calls).toEqual(['showModal', 'close:connected', 'showModal'])
  })
})

describe('Modal: initial focus in each form', () => {
  it('the dashboard dialog has no control to focus while the categories load, then focuses Monto', async () => {
    const categories = deferredResponse()
    appApi((call) => (call.path === '/api/categories' ? categories.promise : undefined))
    const user = userEvent.setup()
    renderAppAt('/')
    await screen.findByTestId('total-spent')

    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    const dialog = await screen.findByRole('dialog', { name: 'Agregar gasto' })

    expect(within(dialog).getByText('Cargando categorías…')).toBeInTheDocument()
    // Only the close button exists; nothing of the form (and nothing disabled) can take the focus.
    expect(within(dialog).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Cerrar'])
    expect(dialog.querySelector('.modal-body input, .modal-body select, .modal-body button')).toBeNull()

    categories.release(json(200, [COMIDA, TRANSPORTE]))

    expect(await within(dialog).findByLabelText('Monto')).toHaveFocus()
  })

  it('the dashboard dialog can be closed with Esc while the categories are still loading', async () => {
    const categories = deferredResponse()
    const api = appApi((call) => (call.path === '/api/categories' ? categories.promise : undefined))
    const user = userEvent.setup()
    renderAppAt('/')
    await screen.findByTestId('total-spent')
    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    const dialog = await screen.findByRole('dialog', { name: 'Agregar gasto' })

    fireEvent.keyDown(dialog, { key: 'Escape' })
    categories.release(json(200, [COMIDA, TRANSPORTE]))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The late answer does not bring the form back.
    await waitFor(() => expect(api.callsTo('GET', '/api/categories')).toHaveLength(1))
    expect(screen.queryByLabelText('Monto')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar gasto' })).toHaveFocus()
  })

  it('the edit form focuses Monto with its current value, not the read-only date', async () => {
    appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[2])

    expect(within(dialog).getByLabelText('Monto')).toHaveFocus()
    expect(within(dialog).getByLabelText('Monto')).toHaveValue('150.50')
    expect(within(dialog).getByLabelText('Fecha')).toHaveAttribute('readonly')
    expect(within(dialog).getByLabelText('Fecha')).not.toHaveFocus()
  })

  it('the delete confirmation focuses Cancelar, never the destructive button', async () => {
    appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[3])

    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Eliminar' })).not.toHaveFocus()
  })

  it('the category form focuses Nombre, not the color picker', async () => {
    appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[5])

    expect(within(dialog).getByLabelText('Nombre')).toHaveFocus()
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Comida')
    expect(within(dialog).getByLabelText('Color')).not.toHaveFocus()
  })

  it('the focus returns to the Editar button of the row after saving an expense', async () => {
    appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[2])

    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Gasto actualizado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar Almuerzo' })).toHaveFocus()
  })

  it('the focus returns to the dashboard button after adding an expense', async () => {
    appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[0])
    await user.type(within(dialog).getByLabelText('Monto'), '10')
    await user.type(within(dialog).getByLabelText('Descripción'), 'Café')
    await user.selectOptions(within(dialog).getByLabelText('Categoría'), 'Comida')

    await user.click(within(dialog).getByRole('button', { name: 'Agregar gasto' }))

    expect(await screen.findByText('Gasto agregado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar gasto' })).toHaveFocus()
  })
})

describe('Modal: interactions inside the forms do not close the dialog', () => {
  it('choosing a category, changing the date and adding a tag keep the expense form open', async () => {
    appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[1])
    const form = within(dialog)

    await user.selectOptions(form.getByLabelText('Categoría'), 'Transporte')
    fireEvent.mouseDown(form.getByLabelText('Categoría'), OUTSIDE)
    fireEvent.click(form.getByLabelText('Categoría'), OUTSIDE)
    fireEvent.mouseDown(form.getByLabelText('Fecha'), OUTSIDE)
    fireEvent.click(form.getByLabelText('Fecha'), OUTSIDE)
    fireEvent.change(form.getByLabelText('Fecha'), { target: { value: '2026-01-05' } })
    await user.type(form.getByLabelText('Etiquetas (opcional)'), 'viaje{Enter}')

    expect(screen.getByRole('dialog', { name: 'Agregar gasto' })).toBeInTheDocument()
    expect(form.getByLabelText('Categoría')).toHaveValue(String(TRANSPORTE.id))
    expect(form.getByLabelText('Fecha')).toHaveValue('2026-01-05')
    expect(form.getByRole('button', { name: 'Quitar etiqueta viaje' })).toBeInTheDocument()
  })

  it('using the color picker keeps the category form open', async () => {
    appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[4])
    const color = within(dialog).getByLabelText('Color')

    fireEvent.mouseDown(color, OUTSIDE)
    fireEvent.click(color, OUTSIDE)
    fireEvent.input(color, { target: { value: '#00aa55' } })

    expect(screen.getByRole('dialog', { name: 'Nueva categoría' })).toBeInTheDocument()
    expect(within(dialog).getByText('#00AA55')).toBeInTheDocument()
  })

  it('Enter in a field of the expense form with invalid data keeps the dialog open with its errors', async () => {
    const api = appApi()
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[1])

    await user.type(within(dialog).getByLabelText('Monto'), '0{Enter}')

    expect(screen.getByRole('dialog', { name: 'Agregar gasto' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Monto')).toHaveAccessibleDescription('Debe ser mayor a 0')
    expect(mutations(api)).toHaveLength(0)
  })
})

// Esc, the Cerrar button and the click outside stay available while a request is in flight
// (only the fields and the form buttons are disabled). Closing then must not leave the page
// in an inconsistent state when the answer arrives.
describe('Modal: closing while a request is in flight', () => {
  async function fillExpense(user: User, dialog: HTMLElement) {
    await user.type(within(dialog).getByLabelText('Monto'), '150.50')
    await user.type(within(dialog).getByLabelText('Descripción'), 'Almuerzo')
    await user.selectOptions(within(dialog).getByLabelText('Categoría'), 'Comida')
  }

  it('gastos: the answer of an add closed with Esc does not close the dialog opened afterwards', async () => {
    const post = deferredResponse()
    const api = appApi((call) => (call.path === '/api/expenses' && call.method === 'POST' ? post.promise : undefined))
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[1])
    await fillExpense(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Agregar gasto' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/expenses')).toHaveLength(1))

    fireEvent.keyDown(dialog, { key: 'Escape' })

    if (screen.queryByRole('dialog')) {
      // Also valid: the dialog refuses to close while it is saving.
      post.release(json(201, { expense: expense({ id: 12 }), exceededLimits: [] }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      return
    }
    await user.click(screen.getByRole('button', { name: 'Editar Taxi' }))
    const edit = await screen.findByRole('dialog', { name: 'Editar gasto' })
    await user.type(within(edit).getByLabelText('Descripción'), ' al aeropuerto')
    const listRequests = api.callsTo('GET', '/api/expenses').length

    post.release(json(201, { expense: expense({ id: 12 }), exceededLimits: [] }))
    await waitFor(() => expect(api.callsTo('GET', '/api/expenses').length).toBeGreaterThan(listRequests))

    // The user is in the middle of another edit: it must survive the late answer.
    const stillEditing = screen.getByRole('dialog', { name: 'Editar gasto' })
    expect(stillEditing).toBeInTheDocument()
    // Scoped to the dialog: the filters of the page also have a "Descripción" field.
    expect(within(stillEditing).getByLabelText('Descripción')).toHaveValue('Taxi al aeropuerto')
  })

  it('gastos: an add that fails after the dialog was closed with Esc is reported to the user', async () => {
    const post = deferredResponse()
    const api = appApi((call) => (call.path === '/api/expenses' && call.method === 'POST' ? post.promise : undefined))
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[1])
    await fillExpense(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Agregar gasto' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/expenses')).toHaveLength(1))

    fireEvent.keyDown(dialog, { key: 'Escape' })
    post.release(apiError(500, 'No se pudo guardar el gasto'))

    // Either the dialog stayed open and shows the error, or the page shows it: the user
    // submitted the expense and must learn that it was not saved.
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el gasto')
    expect(screen.queryByText('Gasto agregado.')).not.toBeInTheDocument()
  })

  it('gastos: the answer of a delete closed with Esc does not close the dialog opened afterwards', async () => {
    const remove = deferredResponse()
    const api = appApi((call) => (call.method === 'DELETE' ? remove.promise : undefined))
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[3])
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/expenses/10')).toHaveLength(1))

    fireEvent.keyDown(dialog, { key: 'Escape' })

    if (screen.queryByRole('dialog')) {
      remove.release(noContent())
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      return
    }
    await user.click(screen.getByRole('button', { name: 'Editar Taxi' }))
    await screen.findByRole('dialog', { name: 'Editar gasto' })
    const listRequests = api.callsTo('GET', '/api/expenses').length

    remove.release(noContent())
    await waitFor(() => expect(api.callsTo('GET', '/api/expenses').length).toBeGreaterThan(listRequests))

    expect(screen.getByRole('dialog', { name: 'Editar gasto' })).toBeInTheDocument()
  })

  it('dashboard: the answer of an add closed by a click outside does not close the form opened afterwards', async () => {
    const post = deferredResponse()
    const api = appApi((call) => (call.path === '/api/expenses' && call.method === 'POST' ? post.promise : undefined))
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[0])
    await fillExpense(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Agregar gasto' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/expenses')).toHaveLength(1))

    fireEvent.mouseDown(dialog, OUTSIDE)
    fireEvent.click(dialog, OUTSIDE)

    if (screen.queryByRole('dialog')) {
      post.release(json(201, { expense: expense({ id: 12 }), exceededLimits: [] }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      return
    }
    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    const second = await screen.findByRole('dialog', { name: 'Agregar gasto' })
    await user.type(await within(second).findByLabelText('Monto'), '77')
    const summaryRequests = api.callsTo('GET', '/api/dashboard/summary').length

    post.release(json(201, { expense: expense({ id: 12 }), exceededLimits: [] }))
    await waitFor(() => expect(api.callsTo('GET', '/api/dashboard/summary').length).toBeGreaterThan(summaryRequests))

    expect(screen.getByRole('dialog', { name: 'Agregar gasto' })).toBeInTheDocument()
    expect(screen.getByLabelText('Monto')).toHaveValue('77')
  })

  it('categorías: closing with Esc while saving does not lose the saved category', async () => {
    const put = deferredResponse()
    let saved = false
    const api = appApi((call) => {
      if (call.method === 'PUT') return put.promise
      if (call.path === '/api/categories' && call.method === 'GET' && saved) {
        return json(200, [{ ...COMIDA, name: 'Alimentos' }, TRANSPORTE])
      }
      return undefined
    })
    const user = userEvent.setup()
    const { dialog } = await openDialog(user, USAGES[5])
    await user.clear(within(dialog).getByLabelText('Nombre'))
    await user.type(within(dialog).getByLabelText('Nombre'), 'Alimentos')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/categories/1')).toHaveLength(1))

    fireEvent.keyDown(dialog, { key: 'Escape' })
    saved = true
    put.release(json(200, { ...COMIDA, name: 'Alimentos' }))

    // Whether or not Esc closed the dialog, the list ends up showing what the server saved.
    expect(await screen.findByText('Alimentos')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Editar Alimentos' })).toBeInTheDocument()
  })
})
