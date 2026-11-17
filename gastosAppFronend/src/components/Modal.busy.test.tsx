import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installClosedBySupport } from '../test/nativeDialog'
import { Modal } from './Modal'
import { useModalBusy } from './modalBusyContext'

const OUTSIDE = { clientX: 5, clientY: 5 }

let restoreClosedBy: (() => void) | null = null

afterEach(() => {
  restoreClosedBy?.()
  restoreClosedBy = null
})

function renderModal(busy: boolean) {
  const onClose = vi.fn()
  const view = render(
    <Modal title="Agregar gasto" onClose={onClose} busy={busy}>
      <input aria-label="Monto" />
    </Modal>,
  )
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Agregar gasto' }), ...view }
}

/** Content that reports its own request in flight, as the forms do through useSubmit. */
function BusyContent() {
  const [busy, setBusy] = useState(false)
  useModalBusy(busy)
  return (
    <button type="button" onClick={() => setBusy(!busy)}>
      {busy ? 'Terminar' : 'Enviar'}
    </button>
  )
}

describe('Modal: busy', () => {
  it('ignores Esc, the close button, a click outside and the native cancel while busy', () => {
    const { onClose, dialog } = renderModal(true)

    const escNotPrevented = fireEvent.keyDown(screen.getByLabelText('Monto'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    fireEvent.mouseDown(dialog, OUTSIDE)
    fireEvent.click(dialog, OUTSIDE)
    const cancelNotPrevented = fireEvent(dialog, new Event('cancel', { cancelable: true }))

    expect(onClose).not.toHaveBeenCalled()
    // Both are prevented, so the browser does not close the dialog on its own either.
    expect(escNotPrevented).toBe(false)
    expect(cancelNotPrevented).toBe(false)
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled()
  })

  it('turns the native light dismiss off while busy and back on afterwards', () => {
    const onClose = vi.fn()
    const { dialog, rerender } = renderModal(true)
    expect(dialog).toHaveAttribute('closedby', 'none')

    rerender(
      <Modal title="Agregar gasto" onClose={onClose} busy={false}>
        <input aria-label="Monto" />
      </Modal>,
    )

    expect(dialog).toHaveAttribute('closedby', 'any')
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeEnabled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores the cancel of a native light dismiss while busy where closedby is supported', () => {
    restoreClosedBy = installClosedBySupport()
    const { onClose, dialog } = renderModal(true)

    fireEvent(dialog, new Event('cancel', { cancelable: true }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('locks while its content reports a request in flight and unlocks when it ends', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Agregar gasto" onClose={onClose}>
        <BusyContent />
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Agregar gasto' })

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.mouseDown(dialog, OUTSIDE)
    fireEvent.click(dialog, OUTSIDE)
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog).toHaveAttribute('closedby', 'none')
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Terminar' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('unlocks when the busy content is removed without reporting the end', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Modal title="Agregar gasto" onClose={onClose}>
        <BusyContent />
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    rerender(
      <Modal title="Agregar gasto" onClose={onClose}>
        <input aria-label="Monto" />
      </Modal>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Modal: Esc during an IME composition', () => {
  it('stays open and leaves the key to the IME (isComposing)', () => {
    const { onClose } = renderModal(false)

    const notPrevented = fireEvent.keyDown(screen.getByLabelText('Monto'), { key: 'Escape', isComposing: true })

    expect(onClose).not.toHaveBeenCalled()
    expect(notPrevented).toBe(true)
  })

  it('stays open when Esc arrives with keyCode 229 (Safari reports isComposing=false)', () => {
    const { onClose } = renderModal(false)

    const notPrevented = fireEvent.keyDown(screen.getByLabelText('Monto'), {
      key: 'Escape',
      keyCode: 229,
      isComposing: false,
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(notPrevented).toBe(true)
  })

  it('closes with the next Esc, once the composition ended', () => {
    const { onClose } = renderModal(false)
    const input = screen.getByLabelText('Monto')

    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    fireEvent.keyDown(input, { key: 'Escape', keyCode: 27 })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
