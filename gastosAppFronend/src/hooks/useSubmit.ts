import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useModalBusy } from '../components/modalBusyContext'
import { ApiError } from '../services/httpClient'
import { getErrorMessage, toFieldErrorMap } from '../utils/errors'
import type { FieldErrorMap } from '../utils/errors'

export interface SubmitState {
  submitting: boolean
  /** Errors keyed by form field (client-side validation or backend `fieldErrors`). */
  fieldErrors: FieldErrorMap
  /** Messages that do not belong to a field of the form. */
  generalErrors: string[]
  /**
   * Runs `action`. Returns true when it succeeded; on failure the backend error is
   * split between `fieldErrors` (known fields) and `generalErrors`.
   */
  submit: (action: () => Promise<void>) => Promise<boolean>
  /** Shows client-side validation errors without calling the API. */
  showFieldErrors: (errors: FieldErrorMap) => void
  reset: () => void
  /**
   * Attach to the `<form>`. After a failed submission the keyboard focus goes to the first
   * field with an error, or to the submit button: the focused button was disabled while
   * submitting, which leaves the focus on `<body>`.
   */
  formRef: RefObject<HTMLFormElement | null>
}

function focusAfterFailure(form: HTMLFormElement) {
  const active = document.activeElement
  const userMovedOn =
    active instanceof HTMLElement && active !== document.body && !active.matches(':disabled') && !form.contains(active)
  if (userMovedOn) return
  const target =
    form.querySelector<HTMLElement>('[aria-invalid="true"]:not(:disabled)') ??
    form.querySelector<HTMLElement>('[type="submit"]:not(:disabled)')
  target?.focus()
}

/**
 * Submission state shared by every form.
 * @param knownFields fields the form can display an error next to (must be a stable array).
 */
export function useSubmit(knownFields: readonly string[]): SubmitState {
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({})
  const [generalErrors, setGeneralErrors] = useState<string[]>([])
  const [failures, setFailures] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  useModalBusy(submitting)

  // An effect, so it runs once the form is enabled again and shows its errors.
  useEffect(() => {
    if (failures > 0 && formRef.current) focusAfterFailure(formRef.current)
  }, [failures])

  const submit = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      setSubmitting(true)
      setFieldErrors({})
      setGeneralErrors([])
      try {
        await action()
        return true
      } catch (error) {
        const all = error instanceof ApiError ? toFieldErrorMap(error.fieldErrors) : {}
        const matched: FieldErrorMap = {}
        const unmatched: string[] = []
        for (const [field, message] of Object.entries(all)) {
          if (knownFields.includes(field)) matched[field] = message
          else unmatched.push(`${field}: ${message}`)
        }
        setFieldErrors(matched)
        // The generic message is redundant when every problem is shown next to its field.
        const hasOnlyFieldErrors = Object.keys(matched).length > 0 && unmatched.length === 0
        setGeneralErrors(hasOnlyFieldErrors ? [] : [getErrorMessage(error), ...unmatched])
        setFailures((count) => count + 1)
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [knownFields],
  )

  const showFieldErrors = useCallback((errors: FieldErrorMap) => {
    setFieldErrors(errors)
    setGeneralErrors([])
  }, [])

  const reset = useCallback(() => {
    setFieldErrors({})
    setGeneralErrors([])
  }, [])

  return { submitting, fieldErrors, generalErrors, submit, showFieldErrors, reset, formRef }
}
