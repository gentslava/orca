import type { UsageHistoryProvider, UsageHistoryRow } from '../../../../shared/usage-history-types'
import {
  totalUsageHistory,
  type UsageHistoryTotals
} from '../../../../shared/usage-history-aggregation'

export const USAGE_PROVIDER_COLORS: Record<UsageHistoryProvider, { color: string; dash: string }> =
  {
    claude: { color: 'var(--chart-provider-claude)', dash: '' },
    codex: { color: 'var(--chart-2)', dash: '7 3' },
    opencode: { color: 'var(--chart-provider-opencode)', dash: '2 3' },
    muse: { color: 'var(--chart-provider-muse)', dash: '8 3 2 3' }
  }

export type UsageHistoryChartPoint = {
  index: number
  usage: UsageHistoryTotals | null
  amount: number | null
}

export function usageHistoryProviderSeries(
  days: readonly { usage: { rows: UsageHistoryRow[] } | null }[],
  metric: 'tokens' | 'cost'
) {
  const providers = new Set(days.flatMap((day) => day.usage?.rows.map((row) => row.provider) ?? []))
  return [...providers].map((provider) => ({
    provider,
    points: days.map((day, index): UsageHistoryChartPoint => {
      const rows = day.usage?.rows.filter((row) => row.provider === provider) ?? []
      const usage = rows.length > 0 ? totalUsageHistory(rows) : null
      return {
        index,
        usage,
        amount:
          metric === 'tokens' ? (usage?.totalTokens ?? null) : (usage?.apiEquivalentCostUsd ?? null)
      }
    })
  }))
}

export function usageHistoryLineSegments(points: readonly UsageHistoryChartPoint[]) {
  const segments: UsageHistoryChartPoint[][] = []
  let segment: UsageHistoryChartPoint[] = []
  for (const point of points) {
    if (point.amount === null) {
      segment = []
    } else {
      if (segment.length === 0) {
        segments.push(segment)
      }
      segment.push(point)
    }
  }
  return segments
}
