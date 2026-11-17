import { createContext, useContext, useLayoutEffect } from 'react'

/** Lets the content of a Modal report that it has a request in flight. `null` outside a Modal. */
export const ModalBusyContext = createContext<((busy: boolean) => void) | null>(null)

/**
 * While `busy` is true the enclosing Modal (if any) refuses to close, so a form cannot be
 * dismissed while its request is in flight. A layout effect, so the Modal is locked in the
 * same commit that disables the form.
 */
export function useModalBusy(busy: boolean): void {
  const report = useContext(ModalBusyContext)
  useLayoutEffect(() => {
    if (!report || !busy) return
    report(true)
    return () => report(false)
  }, [report, busy])
}
