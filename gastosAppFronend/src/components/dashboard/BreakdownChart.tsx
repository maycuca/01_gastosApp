import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BreakdownPoint } from '../../types/api'
import { formatBreakdownLabel, formatBreakdownTick, formatMoney } from '../../utils/format'

// Same values as the CSS tokens --pen, --red, --rule, --ink and --ink-soft (Recharts needs literals).
const PEN = '#2340b0'
const RED = '#c4201c'
const RULE = '#c9d8c4'
const INK = '#1b2440'
const INK_SOFT = '#566074'

const TICK = { fontSize: 12, fill: INK_SOFT, fontFamily: 'inherit' }

interface BreakdownChartProps {
  points: readonly BreakdownPoint[]
  /** Draws the bars in red: the period's limit is exceeded. */
  exceeded: boolean
}

/** Spending per day (or per month for the year) inside the period. */
export function BreakdownChart({ points, exceeded }: BreakdownChartProps) {
  const data = points.map((point) => ({ label: point.label, amount: point.amount }))

  return (
    <div className="chart-box chart-box-wide">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={RULE} vertical={false} />
          <XAxis
            dataKey="label"
            tickFormatter={formatBreakdownTick}
            tick={TICK}
            tickLine={false}
            axisLine={{ stroke: INK }}
          />
          <YAxis width={52} tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: 'rgb(27 36 64 / 7%)' }}
            contentStyle={{ border: `1.5px solid ${INK}`, borderRadius: 3, background: '#fafcf7' }}
            formatter={(value) => [formatMoney(Number(value)), 'Gastado']}
            labelFormatter={(label) => formatBreakdownLabel(String(label))}
          />
          <Bar dataKey="amount" fill={exceeded ? RED : PEN} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
