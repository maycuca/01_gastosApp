import type { CategorySpending } from '../../types/api'
import { formatMoney, formatPercentage } from '../../utils/format'

interface CategoryChartProps {
  categories: readonly CategorySpending[]
}

/** Spending by category: one strip split in proportion, each part in the category's own color. */
export function CategoryChart({ categories }: CategoryChartProps) {
  return (
    <div className="category-chart">
      <div className="category-strip" aria-hidden="true">
        {categories.map((category) => (
          <span
            key={category.categoryId}
            style={{ flex: `${category.amount} 1 0`, backgroundColor: category.color }}
          />
        ))}
      </div>
      <ul className="legend">
        {categories.map((category) => (
          <li key={category.categoryId} className="legend-row">
            <span className="category-chip">
              <span className="color-dot" style={{ backgroundColor: category.color }} aria-hidden="true" />
              {category.name}
            </span>
            <span className="legend-values">
              <span className="amount">{formatMoney(category.amount)}</span>
              <span className="muted">{formatPercentage(category.percentage)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
