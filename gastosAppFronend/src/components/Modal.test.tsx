import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

// jsdom has no `closedby` support and no layout (every box is 0x0), so these tests
// exercise the click-outside fallback: any click that targets the dialog is outside.
function renderModal() {
  const onClose = vi.fn()
  render(
    <Modal title="Agregar gasto" onClose={onClose}>
      <input aria-label="Monto" />
    </Modal>,
  )
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Agregar gasto' }) }
}

describe('Modal', () => {
  it('opens as a dialog and focuses its first control', () => {
    renderModal()

    expect(screen.getByLabelText('Monto')).toHaveFocus()
  })

  it('closes with a click outside', () => {
    const { onClose, dialog } = renderModal()

    fireEvent.mouseDown(dialog, { clientX: 5, clientY: 5 })
    fireEvent.click(dialog, { clientX: 5, clientY: 5 })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when a press that started inside ends outside', () => {
    const { onClose, dialog } = renderModal()

    fireEvent.mouseDown(screen.getByLabelText('Monto'), { clientX: 5, clientY: 5 })
    fireEvent.click(dialog, { clientX: 5, clientY: 5 })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays open on a click inside', () => {
    const { onClose } = renderModal()

    fireEvent.mouseDown(screen.getByLabelText('Monto'))
    fireEvent.click(screen.getByLabelText('Monto'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes with Escape and with the close button', () => {
    const { onClose } = renderModal()

    fireEvent.keyDown(screen.getByLabelText('Monto'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
