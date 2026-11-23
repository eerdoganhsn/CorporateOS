import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Text,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/display'
import type { ChartPoint } from '@/types/api'
import { humanize } from '@/utils/format'
import { EmptyState } from './states'

const PALETTE = ['#27272a', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#3f3f46', '#e4e4e7']
const AXIS = { fontSize: 11, fill: '#71717a' }

export function ChartCard({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  )
}

function hasData(data: ChartPoint[]) {
  return data.some((point) => point.value > 0)
}

interface CategoryTickProps {
  x?: number | string
  y?: number | string
  width?: number | string
  visibleTicksCount?: number
  payload?: { value: string }
}

/** X-axis label that wraps onto a second line instead of colliding with its neighbours. */
function WrappingCategoryTick({ x = 0, y = 0, width = 0, visibleTicksCount = 1, payload }: CategoryTickProps) {
  const slot = Math.max(Number(width) / Math.max(visibleTicksCount, 1) - 2, 24)
  return (
    <Text x={Number(x)} y={Number(y)} width={slot} textAnchor="middle" verticalAnchor="start" {...AXIS} fontSize={slot < 64 ? 10 : AXIS.fontSize}>
      {payload?.value ?? ''}
    </Text>
  )
}

const tooltipStyle = {
  contentStyle: { borderRadius: 6, border: '1px solid #e4e4e7', fontSize: 12, boxShadow: 'none' },
  cursor: { fill: 'rgba(0,0,0,0.04)' },
}

export function SimpleBarChart({
  data,
  height = 240,
  formatValue,
  horizontal,
}: {
  data: ChartPoint[]
  height?: number
  formatValue?: (value: number) => string
  horizontal?: boolean
}) {
  if (!hasData(data)) return <EmptyState title="No data for this period" className="py-8" />
  const points = data.map((p) => ({ ...p, label: humanize(p.label) }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      {horizontal ? (
        <BarChart data={points} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke="#f4f4f5" />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={formatValue} />
          <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={130} />
          <Tooltip {...tooltipStyle} formatter={(v) => (formatValue ? formatValue(Number(v)) : v)} />
          <Bar dataKey="value" name="Value" fill="#27272a" radius={[0, 3, 3, 0]} maxBarSize={22} />
        </BarChart>
      ) : (
        <BarChart data={points} margin={{ top: 4, right: 4, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#f4f4f5" />
          <XAxis dataKey="label" tick={<WrappingCategoryTick />} axisLine={false} tickLine={false} interval={0} height={36} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={formatValue} />
          <Tooltip {...tooltipStyle} formatter={(v) => (formatValue ? formatValue(Number(v)) : v)} />
          <Bar dataKey="value" name="Value" fill="#27272a" radius={[3, 3, 0, 0]} maxBarSize={36} />
        </BarChart>
      )}
    </ResponsiveContainer>
  )
}

export function TrendChart({
  data,
  height = 240,
  formatValue,
}: {
  data: ChartPoint[]
  height?: number
  formatValue?: (value: number) => string
}) {
  if (!hasData(data)) return <EmptyState title="No data for this period" className="py-8" />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -8 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#27272a" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#27272a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f4f4f5" />
        {/* Evenly spaced labels when not all months fit (the default drops them irregularly). */}
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="equidistantPreserveStart" />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={formatValue} />
        <Tooltip {...tooltipStyle} formatter={(v) => (formatValue ? formatValue(Number(v)) : v)} />
        <Area type="monotone" dataKey="value" name="Value" stroke="#27272a" strokeWidth={2} fill="url(#trendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DonutChart({ data, height = 240 }: { data: ChartPoint[]; height?: number }) {
  const points = data.filter((p) => p.value > 0).map((p) => ({ ...p, label: humanize(p.label) }))
  if (points.length === 0) return <EmptyState title="No data for this period" className="py-8" />
  const total = points.reduce((sum, p) => sum + p.value, 0)

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="w-full sm:w-1/2">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={points} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none">
              {points.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle.contentStyle} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-2 text-sm sm:w-1/2">
        {points.map((p, i) => (
          <li key={p.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
              {p.label}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {p.value} <span className="text-xs">({Math.round((p.value / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
