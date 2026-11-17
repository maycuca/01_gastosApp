import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { Period } from '../../types/api'
import { DASHBOARD_PANEL_ID, periodTabId } from '../../utils/ids'
import { PERIOD_LABELS, PERIODS } from '../../utils/periods'

interface PeriodTabsProps {
  selected: Period
  onSelect: (period: Period) => void
}

/** Index of the tab a key moves to, or `null` when the key is not a tab navigation key. */
function targetIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count
    case 'ArrowLeft':
      return (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * WAI-ARIA tabs with automatic activation: the arrows (wrapping around), Home and End move
 * the focus and select the tab. Only the selected tab is in the Tab order.
 */
export function PeriodTabs({ selected, onSelect }: PeriodTabsProps) {
  const tabRefs = useRef<Partial<Record<Period, HTMLButtonElement | null>>>({})

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, period: Period) {
    const next = targetIndex(event.key, PERIODS.indexOf(period), PERIODS.length)
    if (next === null) return
    event.preventDefault()
    const target = PERIODS[next]
    tabRefs.current[target]?.focus()
    if (target !== selected) onSelect(target)
  }

  return (
    <div className="tabs" role="tablist" aria-label="Período">
      {PERIODS.map((period) => {
        const isSelected = period === selected
        return (
          <button
            key={period}
            ref={(element) => {
              tabRefs.current[period] = element
            }}
            id={periodTabId(period)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={DASHBOARD_PANEL_ID}
            tabIndex={isSelected ? 0 : -1}
            className={isSelected ? 'tab tab-active' : 'tab'}
            onClick={() => onSelect(period)}
            onKeyDown={(event) => handleKeyDown(event, period)}
          >
            {PERIOD_LABELS[period]}
          </button>
        )
      })}
    </div>
  )
}
