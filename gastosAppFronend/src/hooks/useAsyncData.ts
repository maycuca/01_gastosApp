import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../utils/errors'

export interface AsyncData<T> {
  /**
   * Last loaded value. `null` before the first load and after a failed one. While a
   * reload is in flight it still holds the previous value (check `loading`).
   */
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/** Outcome of the load identified by `loader` + `reloadKey`. */
interface Settled<T> {
  loader: () => Promise<T>
  reloadKey: number
  data: T | null
  error: string | null
}

/**
 * Runs `loader` on mount, whenever its identity changes and on `reload()`.
 * Pass a stable function (module-level or `useCallback`). Late responses of a
 * superseded load are ignored.
 */
export function useAsyncData<T>(loader: () => Promise<T>): AsyncData<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    loader()
      .then((data) => {
        if (!cancelled) setSettled({ loader, reloadKey, data, error: null })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ loader, reloadKey, data: null, error: getErrorMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [loader, reloadKey])

  const reload = useCallback(() => {
    setReloadKey((current) => current + 1)
  }, [])

  // Loading is derived: the last settled load is not the one currently requested.
  const loading = settled === null || settled.loader !== loader || settled.reloadKey !== reloadKey

  return {
    data: settled?.data ?? null,
    loading,
    error: loading ? null : (settled?.error ?? null),
    reload,
  }
}
