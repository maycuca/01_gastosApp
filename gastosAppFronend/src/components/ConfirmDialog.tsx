import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getErrorMessage } from '../utils/errors'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  /** The dialog stays open and shows the error if this rejects. */
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // The confirm button was disabled while the request was in flight and lost the focus.
  useEffect(() => {
    if (error !== null && !busy) confirmRef.current?.focus()
  }, [error, busy])

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (cause) {
      setError(getErrorMessage(cause))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onCancel} busy={busy}>
      <div className="confirm-text">{children}</div>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button ref={confirmRef} type="button" className="btn btn-danger" onClick={handleConfirm} disabled={busy}>
          {busy ? 'Procesando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
