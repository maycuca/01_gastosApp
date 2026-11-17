import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { COMIDA } from '../test/fakeApi'
import { ExpenseForm } from './ExpenseForm'
import { TagInput } from './TagInput'

function Host({ initial = [] }: { initial?: string[] }) {
  const [tags, setTags] = useState<string[]>(initial)
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

describe('TagInput: Enter', () => {
  it('adds the typed text as a normalized tag and clears the box', async () => {
    const user = userEvent.setup()
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')

    await user.type(input, '  Trabajo {Enter}')

    expect(addedTags()).toEqual(['trabajo'])
    expect(input).toHaveValue('')
  })

  it('prevents the default action of a plain Enter, so the form is not submitted', () => {
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')
    fireEvent.change(input, { target: { value: 'viaje' } })

    const notPrevented = fireEvent.keyDown(input, { key: 'Enter' })

    expect(notPrevented).toBe(false)
    expect(addedTags()).toEqual(['viaje'])
  })

  it('does not add the tag when Enter confirms an IME composition (isComposing)', () => {
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')
    fireEvent.change(input, { target: { value: 'にほん' } })

    const notPrevented = fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(addedTags()).toEqual([])
    expect(input).toHaveValue('にほん')
    // The key is left to the IME.
    expect(notPrevented).toBe(true)
  })

  it('does not add the tag when Enter arrives with keyCode 229 (Safari reports isComposing=false)', () => {
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')
    fireEvent.change(input, { target: { value: '한국' } })

    const notPrevented = fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: false })

    expect(addedTags()).toEqual([])
    expect(input).toHaveValue('한국')
    expect(notPrevented).toBe(true)
  })

  it('adds the composed text with the next Enter, once the composition ended', () => {
    render(<Host initial={['trabajo']} />)
    const input = screen.getByLabelText('Etiquetas')
    fireEvent.change(input, { target: { value: '日本' } })

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 })

    expect(addedTags()).toEqual(['trabajo', '日本'])
    expect(input).toHaveValue('')
  })

  it('removes the last tag with Backspace on an empty box', async () => {
    const user = userEvent.setup()
    render(<Host initial={['trabajo', 'viaje']} />)

    await user.type(screen.getByLabelText('Etiquetas'), '{Backspace}')

    expect(addedTags()).toEqual(['trabajo'])
  })

  it('still adds tags with a comma and with the Agregar button', async () => {
    const user = userEvent.setup()
    render(<Host />)
    const input = screen.getByLabelText('Etiquetas')

    await user.type(input, 'uno,')
    await user.type(input, 'dos')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(addedTags()).toEqual(['uno', 'dos'])
  })
})

describe('ExpenseForm: tags and IME composition', () => {
  it('neither adds the tag nor submits the form on the Enter of a composition', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<ExpenseForm categories={[COMIDA]} onSubmit={onSubmit} onCancel={() => {}} />)
    await user.type(screen.getByLabelText('Monto'), '10')
    await user.type(screen.getByLabelText('Descripción'), 'Ramen')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Comida')
    const tags = screen.getByLabelText('Etiquetas (opcional)')
    fireEvent.change(tags, { target: { value: 'らーめん' } })

    fireEvent.keyDown(tags, { key: 'Enter', isComposing: true })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'Etiquetas agregadas' })).not.toBeInTheDocument()
    expect(tags).toHaveValue('らーめん')
    expect(screen.getByText('0 de 10 etiquetas')).toBeInTheDocument()

    // The text still in the box counts as a tag on submit.
    await user.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: 10, description: 'Ramen', tags: ['らーめん'] })
  })
})
