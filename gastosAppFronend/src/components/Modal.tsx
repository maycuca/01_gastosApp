import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react'
import { ModalBusyContext } from './modalBusyContext'

interface ModalProps {
  title: string
  onClose: () => void
  /** A request is in flight: Esc, the close button and a click outside are ignored. */
  busy?: boolean
  children: ReactNode
}

const FIRST_CONTROL =
  '.modal-body input:not(:disabled), .modal-body select:not(:disabled), .modal-body button:not(:disabled)'

function supportsClosedBy(): boolean {
  return typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype
}

function isOutside(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false
  const box = event.currentTarget.getBoundingClientRect()
  return (
    event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
  )
}

/**
 * Modal built on the native `<dialog>`: `showModal()` traps focus, makes the page behind
 * inert and returns focus to the opener on close. It closes with Esc, the close button
 * or a click outside, except while it is busy (the `busy` prop, or a form inside that is
 * submitting): closing then would hide the outcome of the request from the user.
 * Mount it to open, unmount it to close.
 */
export function Modal({ title, onClose, busy = false, children }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pressStartedOutside = useRef(false)
  const [contentBusy, setContentBusy] = useState(false)
  const locked = busy || contentBusy

  // A layout effect, so close() runs while the dialog is still in the document;
  // otherwise the browser cannot return focus to the control that opened it.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    // showModal() focuses the first focusable element, which is the close button.
    dialog.querySelector<HTMLElement>(FIRST_CONTROL)?.focus()
    return () => {
      if (typeof dialog.close === 'function' && dialog.open) dialog.close()
    }
  }, [])

  // The parent owns the open state, so native close requests (Esc, a click outside
  // with `closedby`) are turned into onClose.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    if (!locked) onClose()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Escape') return
    // An Esc that cancels an IME composition belongs to the IME, not to the dialog.
    // Safari reports isComposing=false on that keydown; keyCode 229 catches it.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    // Prevented even while locked, so the browser does not close the dialog on its own.
    event.preventDefault()
    if (!locked) onClose()
  }

  // Click outside for browsers without `closedby` (Safari): a click on the backdrop targets
  // the dialog itself. The press must also start outside, so dragging a text selection
  // out of a field does not close the form.
  function handleMouseDown(event: MouseEvent<HTMLDialogElement>) {
    pressStartedOutside.current = isOutside(event)
  }

  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (locked || supportsClosedBy()) return
    if (pressStartedOutside.current && isOutside(event)) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      {...{ closedby: locked ? 'none' : 'any' }}
    >
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          disabled={locked}
          aria-label="Cerrar"
        >
          ×
        </button>
      </header>
      <div className="modal-body">
        <ModalBusyContext value={setContentBusy}>{children}</ModalBusyContext>
      </div>
    </dialog>
  )
}
