import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installClosedBySupport, installNativeDialog, setDialogBox } from '../test/nativeDialog'
import type { NativeDialogStub } from '../test/nativeDialog'
import { Modal } from './Modal'

// Second QA round for the Modal rewritten on the native <dialog>.
// jsdom has no layout, no top layer, no inertness and no `closedby`; what depends on those
// is not asserted here. `installNativeDialog` stands in for showModal()/close().

const OUTSIDE = { clientX: 5, clientY: 5 }
const BOX = { left: 100, top: 100, right: 400, bottom: 500 }
const INSIDE = { clientX: 250, clientY: 300 }

let native: NativeDialogStub | null = null
let restoreClosedBy: (() => void) | null = null

afterEach(() => {
  native?.restore()
  native = null
  restoreClosedBy?.()
  restoreClosedBy = null
})

function renderModal(children: ReactNode = <input aria-label="Monto" />) {
  const onClose = vi.fn()
  const view = render(
    <Modal title="Agregar gasto" onClose={onClose}>
      {children}
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Agregar gasto' })
  return { onClose, dialog, ...view }
}

/** Two openers, each mounting its own Modal, as the pages do. */
function TwoDialogs() {
  const [open, setOpen] = useState<'a' | 'b' | null>(null)
  return (
    <div>
      <button type="button" onClick={() => setOpen('a')}>
        Abrir A
      </button>
      <button type="button" onClick={() => setOpen('b')}>
        Abrir B
      </button>
      {open === 'a' && (
        <Modal title="Diálogo A" onClose={() => setOpen(null)}>
          <input aria-label="Campo A" />
          <button type="button" onClick={() => setOpen('b')}>
            Pasar a B
          </button>
        </Modal>
      )}
      {open === 'b' && (
        <Modal title="Diálogo B" onClose={() => setOpen(null)}>
          <input aria-label="Campo B" />
        </Modal>
      )}
    </div>
  )
}

describe('Modal: native dialog', () => {
  it('opens with showModal() and is labelled by its title', () => {
    native = installNativeDialog()
    const { dialog } = renderModal()

    expect(native.calls).toEqual(['showModal'])
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAccessibleName('Agregar gasto')
  })

  it('asks the browser for light dismiss with closedby="any"', () => {
    const { dialog } = renderModal()

    expect(dialog).toHaveAttribute('closedby', 'any')
  })

  it('closes the dialog while it is still in the document when it unmounts', () => {
    native = installNativeDialog()
    const { unmount, onClose } = renderModal()

    unmount()

    // A detached dialog cannot give the focus back to the control that opened it.
    expect(native.calls).toEqual(['showModal', 'close:connected'])
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('unmounts without errors where showModal() does not exist', () => {
    const { unmount } = renderModal()

    expect(() => unmount()).not.toThrow()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('turns a native close request (cancel event) into onClose and keeps the open state in the parent', () => {
    const { onClose, dialog } = renderModal()

    const notPrevented = fireEvent(dialog, new Event('cancel', { cancelable: true }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(notPrevented).toBe(false)
    expect(dialog).toHaveAttribute('open')
  })
})

describe('Modal: focus', () => {
  it('focuses the first enabled control of the body, not the close button', () => {
    renderModal(
      <>
        <input aria-label="Deshabilitado" disabled />
        <select aria-label="Categoría">
          <option>Comida</option>
        </select>
        <input aria-label="Monto" />
      </>,
    )

    expect(screen.getByLabelText('Categoría')).toHaveFocus()
  })

  it('focuses the first button when the body has no fields (confirmation)', () => {
    renderModal(
      <>
        <p>¿Eliminar?</p>
        <button type="button">Cancelar</button>
        <button type="button">Eliminar</button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  it('does not fail when the body has no controls yet (loading state)', () => {
    const { dialog } = renderModal(<p role="status">Cargando categorías…</p>)

    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Cargando categorías…')).toBeInTheDocument()
  })

  it('returns the focus to the opener when it closes', async () => {
    native = installNativeDialog()
    const user = userEvent.setup()
    render(<TwoDialogs />)

    await user.click(screen.getByRole('button', { name: 'Abrir A' }))
    expect(screen.getByLabelText('Campo A')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir A' })).toHaveFocus()
  })

  it('opens a second dialog after the first one with its own focus and opener', async () => {
    native = installNativeDialog()
    const user = userEvent.setup()
    render(<TwoDialogs />)

    await user.click(screen.getByRole('button', { name: 'Abrir A' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Abrir B' }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Diálogo B' })).toBeInTheDocument()
    expect(screen.getByLabelText('Campo B')).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir B' })).toHaveFocus()
    expect(native.calls).toEqual(['showModal', 'close:connected', 'showModal', 'close:connected'])
  })

  it('replaces one dialog with another in the same update', async () => {
    native = installNativeDialog()
    const user = userEvent.setup()
    render(<TwoDialogs />)

    await user.click(screen.getByRole('button', { name: 'Abrir A' }))
    await user.click(screen.getByRole('button', { name: 'Pasar a B' }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Diálogo B' })).toHaveAttribute('open')
    expect(screen.getByLabelText('Campo B')).toHaveFocus()
    // The first dialog is closed before the second one is shown.
    expect(native.calls).toEqual(['showModal', 'close:connected', 'showModal'])
  })
})

describe('Modal: click outside fallback (browsers without closedby)', () => {
  it('closes once when the press starts and ends on the backdrop', () => {
    const { onClose, dialog } = renderModal()
    setDialogBox(dialog, BOX)

    fireEvent.mouseDown(dialog, OUTSIDE)
    fireEvent.mouseUp(dialog, OUTSIDE)
    fireEvent.click(dialog, OUTSIDE)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['left', { clientX: 50, clientY: 300 }],
    ['right', { clientX: 450, clientY: 300 }],
    ['above', { clientX: 250, clientY: 50 }],
    ['below', { clientX: 250, clientY: 550 }],
  ])('treats a click %s of the box as outside', (_side, point) => {
    const { onClose, dialog } = renderModal()
    setDialogBox(dialog, BOX)

    fireEvent.mouseDown(dialog, point)
    fireEvent.click(dialog, point)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open on a click on the dialog surface itself (padding, scrollbar)', () => {
    const { onClose, dialog } = renderModal()
    setDialogBox(dialog, BOX)

    fireEvent.mouseDown(dialog, INSIDE)
    fireEvent.click(dialog, INSIDE)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open when the press starts outside and ends inside', () => {
    const { onClose, dialog } = renderModal()
    setDialogBox(dialog, BOX)

    fireEvent.mouseDown(dialog, OUTSIDE)
    // The browser targets the click at the common ancestor: the dialog, at the release point.
    fireEvent.click(dialog, INSIDE)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('forgets an outside press once another press starts inside', () => {
    const { onClose, dialog } = renderModal()
    setDialogBox(dialog, BOX)

    fireEvent.mouseDown(dialog, OUTSIDE)
    fireEvent.mouseDown(screen.getByLabelText('Monto'), INSIDE)
    fireEvent.click(dialog, OUTSIDE)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open on a click outside that had no press (synthetic click)', () => {
    const { onClose, dialog } = renderModal()
    setDialogBox(dialog, BOX)

    fireEvent.click(dialog, OUTSIDE)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open while using a select, a date field and a color field inside', async () => {
    const user = userEvent.setup()
    const { onClose, dialog } = renderModal(
      <>
        <select aria-label="Categoría" defaultValue="">
          <option value="">Selecciona</option>
          <option value="1">Comida</option>
        </select>
        <input aria-label="Fecha" type="date" defaultValue="2026-11-15" />
        <input aria-label="Color" type="color" defaultValue="#ff8a00" />
      </>,
    )
    setDialogBox(dialog, BOX)

    await user.selectOptions(screen.getByLabelText('Categoría'), 'Comida')
    await user.click(screen.getByLabelText('Fecha'))
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-10' } })
    await user.click(screen.getByLabelText('Color'))
    fireEvent.input(screen.getByLabelText('Color'), { target: { value: '#2196f3' } })
    // Native pickers are drawn outside the dialog box: their clicks report outside coordinates
    // but target the control, never the dialog.
    fireEvent.mouseDown(screen.getByLabelText('Categoría'), OUTSIDE)
    fireEvent.click(screen.getByLabelText('Categoría'), OUTSIDE)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Categoría')).toHaveValue('1')
  })

  it('leaves the click outside to the browser when closedby is supported', () => {
    restoreClosedBy = installClosedBySupport()
    const { onClose, dialog } = renderModal()
    setDialogBox(dialog, BOX)

    fireEvent.mouseDown(dialog, OUTSIDE)
    fireEvent.click(dialog, OUTSIDE)
    // No double close: the browser reports its own light dismiss through `cancel`.
    expect(onClose).not.toHaveBeenCalled()

    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Modal: keyboard', () => {
  it('closes with Escape from any control inside, including the close button', () => {
    const { onClose } = renderModal()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Cerrar' }), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it.each(['Enter', 'Tab', ' ', 'a'])('ignores the key %j', (key) => {
    const { onClose } = renderModal()

    fireEvent.keyDown(screen.getByLabelText('Monto'), { key })

    expect(onClose).not.toHaveBeenCalled()
  })
})
