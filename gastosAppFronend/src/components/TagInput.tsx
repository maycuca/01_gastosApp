import type { KeyboardEvent } from 'react'
import { MAX_TAG_LENGTH, MAX_TAGS, mergeTags } from '../utils/tags'

interface TagInputProps {
  id: string
  tags: readonly string[]
  onTagsChange: (tags: string[]) => void
  /** Text being typed that is not a tag yet (owned by the form so it can be included on submit). */
  draft: string
  onDraftChange: (draft: string) => void
  disabled?: boolean
  describedBy?: string
}

/** Captures tags as a list of texts: Enter or comma adds the typed text as a tag. */
export function TagInput({ id, tags, onTagsChange, draft, onDraftChange, disabled, describedBy }: TagInputProps) {
  function commitDraft() {
    if (draft.trim() === '') return
    onTagsChange(mergeTags(tags, draft))
    onDraftChange('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const commits = event.key === 'Enter' || event.key === ','
    // A key pressed during an IME composition (Japanese, Chinese, Korean) belongs to the IME:
    // Enter confirms it and a comma is part of the text. Safari reports isComposing=false on
    // that keydown; keyCode 229 catches it.
    if (commits && (event.nativeEvent.isComposing || event.keyCode === 229)) return
    if (commits) {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      onTagsChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="tag-input">
      {tags.length > 0 && (
        <ul className="tag-list" aria-label="Etiquetas agregadas">
          {tags.map((tag) => (
            <li key={tag} className="tag">
              <span>{tag}</span>
              <button
                type="button"
                className="tag-remove"
                onClick={() => onTagsChange(tags.filter((current) => current !== tag))}
                disabled={disabled}
                aria-label={`Quitar etiqueta ${tag}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="tag-input-row">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_TAG_LENGTH}
          placeholder="Escribe una etiqueta y presiona Enter"
          disabled={disabled}
          aria-describedby={describedBy}
          autoComplete="off"
        />
        <button type="button" className="btn" onClick={commitDraft} disabled={disabled || draft.trim() === ''}>
          Agregar
        </button>
      </div>
      <p className="field-hint">
        {tags.length} de {MAX_TAGS} etiquetas
      </p>
    </div>
  )
}
