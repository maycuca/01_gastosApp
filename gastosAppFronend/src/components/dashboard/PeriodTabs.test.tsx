import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Period } from '../../types/api'
import { PeriodTabs } from './PeriodTabs'

function Harness({ initial = 'MONTH', onSelect }: { initial?: Period; onSelect?: (period: Period) => void }) {
  const [selected, setSelected] = useState<Period>(initial)
  return (
    <>
      <button type="button">Antes</button>
      <PeriodTabs
        selected={selected}
        onSelect={(period) => {
          onSelect?.(period)
          setSelected(period)
        }}
      />
      <button type="button">Después</button>
    </>
  )
}

function tab(name: string) {
  return screen.getByRole('tab', { name })
}

function expectSelected(name: string) {
  expect(tab(name)).toHaveAttribute('aria-selected', 'true')
  expect(tab(name)).toHaveFocus()
  const selected = screen.getAllByRole('tab').filter((item) => item.getAttribute('aria-selected') === 'true')
  expect(selected).toHaveLength(1)
}

describe('PeriodTabs: keyboard', () => {
  it('only the selected tab is in the Tab order', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(tab('Mes')).toHaveAttribute('tabindex', '0')
    for (const name of ['Día', 'Semana', 'Quincena', 'Año']) expect(tab(name)).toHaveAttribute('tabindex', '-1')

    screen.getByRole('button', { name: 'Antes' }).focus()
    await user.tab()
    expect(tab('Mes')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Después' })).toHaveFocus()
  })

  it('the right and left arrows move to and select the next and previous tab', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSelect={onSelect} />)
    tab('Mes').focus()

    await user.keyboard('{ArrowRight}')
    expectSelected('Año')
    expect(tab('Año')).toHaveAttribute('tabindex', '0')
    expect(tab('Mes')).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{ArrowLeft}')
    expectSelected('Mes')
    await user.keyboard('{ArrowLeft}')
    expectSelected('Quincena')
    expect(onSelect.mock.calls.map(([period]) => period)).toEqual(['YEAR', 'MONTH', 'FORTNIGHT'])
  })

  it('the arrows wrap around at both ends', async () => {
    const user = userEvent.setup()
    render(<Harness initial="YEAR" />)
    tab('Año').focus()

    await user.keyboard('{ArrowRight}')
    expectSelected('Día')
    await user.keyboard('{ArrowLeft}')
    expectSelected('Año')
  })

  it('Home and End go to the first and the last tab', async () => {
    const user = userEvent.setup()
    render(<Harness initial="WEEK" />)
    tab('Semana').focus()

    await user.keyboard('{End}')
    expectSelected('Año')
    await user.keyboard('{Home}')
    expectSelected('Día')
  })

  it('ignores other keys and does not select again the tab that is already selected', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial="DAY" onSelect={onSelect} />)
    tab('Día').focus()

    await user.keyboard('{ArrowDown}{ArrowUp}a{Home}')

    expectSelected('Día')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
