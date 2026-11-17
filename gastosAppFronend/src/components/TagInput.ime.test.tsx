import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TagInput } from './TagInput'

function Host() {
  const [tags, setTags] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  return (
    <>
      <label htmlFor="tags">Etiquetas</label>
      <TagInput id="tags" tags={tags} onTagsChange={setTags} draft={draft} onDraftChange={setDraft} />
    </>
  )
}

function addedTags(): string[] {
  const list = screen.queryByRole('list', { name: 'Etiquetas agregadas' })
  return list ? within(list).getAllByRole('listitem').map((item) => item.textContent?.replace('×', '') ?? '') : []
}

describe('TagInput: comma during an IME composition', () => {
  it('does not add the tag when the comma is typed inside a composition (isComposing)', () => {
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')
    fireEvent.change(input, { target: { value: 'にほん' } })

    const notPrevented = fireEvent.keyDown(input, { key: ',', isComposing: true })

    expect(addedTags()).toEqual([])
    expect(input).toHaveValue('にほん')
    // The key is left to the IME.
    expect(notPrevented).toBe(true)
  })

  it('does not add the tag when the comma arrives with keyCode 229 (Safari reports isComposing=false)', () => {
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')
    fireEvent.change(input, { target: { value: '한국' } })

    const notPrevented = fireEvent.keyDown(input, { key: ',', keyCode: 229, isComposing: false })

    expect(addedTags()).toEqual([])
    expect(input).toHaveValue('한국')
    expect(notPrevented).toBe(true)
  })

  it('adds the composed text with a comma once the composition ended', () => {
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')
    fireEvent.change(input, { target: { value: '日本' } })

    fireEvent.keyDown(input, { key: ',', isComposing: true })
    const notPrevented = fireEvent.keyDown(input, { key: ',', keyCode: 188 })

    expect(addedTags()).toEqual(['日本'])
    expect(input).toHaveValue('')
    expect(notPrevented).toBe(false)
  })
})
