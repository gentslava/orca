import { useState } from 'react'
import type { UsageHistoryRange, UsageHistoryRow } from '../../../../shared/usage-history-types'
import { Button } from '../ui/button'
import { SettingsSegmentedControl } from '../settings/SettingsFormControls'
import { UsageRecentSessionsTable } from './UsageRecentSessionsTable'
import {
  groupUsageHistory,
  usageHistoryAccountKey,
  usageHistoryChartDays,
  type UsageHistoryGroup
} from './usage-history-model'
import { formatUsageCost, formatUsageTokens } from './usage-overview-model'
import { formatUsageDayLabel } from './usage-formatters'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { usageHistoryAccountLabel } from './usage-history-accounts'
import { getAgentLabel } from '@/lib/agent-catalog'

export function UsageHistoryDailyChart({
  rows,
  range,
  selectedDay,
  onDay
}: {
  rows: readonly UsageHistoryRow[]
  range: UsageHistoryRange
  selectedDay: string | null
  onDay: (day: string) => void
}): React.JSX.Element {
  const [metric, setMetric] = useState<'tokens' | 'cost'>('tokens')
  const days = usageHistoryChartDays(rows, range, selectedDay).map((day) => ({
    ...day,
    amount:
      metric === 'tokens'
        ? (day.usage?.totalTokens ?? null)
        : (day.usage?.apiEquivalentCostUsd ?? null)
  }))
  const max = days.reduce((value, day) => Math.max(value, day.amount ?? 0), Number.EPSILON)
  const partialCost =
    metric === 'cost' &&
    days.some((day) => day.usage && (day.amount === null || day.usage.hasPartialCost))
  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-card p-4"
      data-testid="usage-history-daily"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">
          {translate('stats.usage.daily.title', 'Daily usage')}
        </h4>
        <SettingsSegmentedControl<'tokens' | 'cost'>
          value={metric}
          onChange={setMetric}
          ariaLabel={translate('stats.usage.daily.metric', 'Chart metric')}
          options={[
            { value: 'tokens', label: translate('stats.usage.tokens', 'Tokens') },
            {
              value: 'cost',
              label: translate('stats.usage.daily.cost', 'API estimate')
            }
          ]}
          size="sm"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {translate(
          'stats.usage.daily.description',
          'Select a day to inspect its usage. Gaps have no recorded data, rather than verified zero usage.'
        )}
      </p>
      {partialCost ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate(
            'stats.usage.daily.partialCost',
            'Some usage has no recorded price. Cost bars show the priced portion; * marks a partial estimate. This is not a billing statement.'
          )}
        </p>
      ) : null}
      <div className="overflow-x-auto scrollbar-sleek">
        <div className="flex h-44 min-w-full items-end gap-1.5 pb-1">
          {days.map(({ day: key, usage: day, amount }) =>
            day && amount !== null ? (
              <button
                type="button"
                key={day.key}
                onClick={() => onDay(day.key)}
                aria-label={
                  metric === 'tokens'
                    ? translate('stats.usage.daily.inspect', '{{day}}: {{tokens}} tokens', {
                        day: day.key,
                        tokens: day.totalTokens.toLocaleString(getIntlLocale())
                      })
                    : translate(
                        'stats.usage.daily.inspectCost',
                        '{{day}}: {{cost}} API-equivalent estimate',
                        {
                          day: day.key,
                          cost: `${formatUsageCost(amount)}${day.hasPartialCost ? ' *' : ''}`
                        }
                      )
                }
                title={`${day.key} · ${metric === 'tokens' ? day.totalTokens.toLocaleString(getIntlLocale()) : `${formatUsageCost(amount)}${day.hasPartialCost ? ' *' : ''}`}`}
                className="flex h-full min-w-8 flex-1 flex-col justify-end gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-h-0 flex-1 items-end justify-center">
                  <span
                    className="block w-full max-w-10 rounded-t-sm bg-primary/75"
                    style={{
                      height: `${(amount / max) * 100}%`,
                      minHeight: amount > 0 ? 2 : 0
                    }}
                  />
                </span>
                <span className="text-center text-[11px] text-muted-foreground">
                  {formatUsageDayLabel(day.key)}
                </span>
              </button>
            ) : (
              <span
                key={key}
                className="flex h-full min-w-8 flex-1 flex-col justify-end gap-2"
                title={`${key} · ${metric === 'cost' && day ? formatUsageCost(null) : '—'}`}
              >
                <span className="text-center text-[11px] text-muted-foreground">
                  {formatUsageDayLabel(key)}
                </span>
              </span>
            )
          )}
        </div>
      </div>
    </section>
  )
}

function HistoryTotalsList({
  title,
  rows,
  onSelect
}: {
  title: string
  rows: UsageHistoryGroup[]
  onSelect: (value: string) => void
}): React.JSX.Element {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4">
      <h4 className="mb-3 text-sm font-medium text-foreground">{title}</h4>
      <div className="max-h-64 space-y-1 overflow-y-auto scrollbar-sleek">
        {rows.map((row) => (
          <Button
            key={row.key}
            variant="ghost"
            size="sm"
            onClick={() => onSelect(row.key)}
            className="h-auto w-full justify-between"
          >
            <span className="min-w-0 flex-1 break-all whitespace-normal text-left">
              {row.label}
            </span>
            <span className="shrink-0 text-right tabular-nums text-muted-foreground">
              {formatUsageTokens(row.totalTokens)}
              <span className="block">
                {formatUsageCost(row.apiEquivalentCostUsd)}
                {row.hasPartialCost ? ' *' : ''}
              </span>
            </span>
          </Button>
        ))}
      </div>
    </section>
  )
}

export function UsageHistoryBreakdowns({
  rows,
  onModel,
  onProject,
  onAccount,
  accountLabels
}: {
  rows: readonly UsageHistoryRow[]
  onModel: (model: string) => void
  onProject: (project: string) => void
  onAccount: (account: string) => void
  accountLabels: ReadonlyMap<string, string>
}): React.JSX.Element {
  const unknown = translate('stats.usage.unknown', 'Unknown')
  return (
    <div className="grid gap-3 @xl:grid-cols-3">
      <HistoryTotalsList
        title={translate('stats.usage.accounts.title', 'By account · tokens / API estimate')}
        rows={groupUsageHistory(rows, 'account', unknown).map((group) => ({
          ...group,
          label: group.rows[0] ? usageHistoryAccountLabel(group.rows[0], accountLabels) : unknown
        }))}
        onSelect={onAccount}
      />
      <HistoryTotalsList
        title={translate('stats.usage.models.title', 'By model · tokens / API estimate')}
        rows={groupUsageHistory(rows, 'model', unknown)}
        onSelect={onModel}
      />
      <HistoryTotalsList
        title={translate('stats.usage.projects.title', 'By project · tokens / API estimate')}
        rows={groupUsageHistory(rows, 'project', unknown)}
        onSelect={onProject}
      />
    </div>
  )
}

export function UsageHistorySessions({
  rows,
  accountLabels
}: {
  rows: readonly UsageHistoryRow[]
  accountLabels: ReadonlyMap<string, string>
}): React.JSX.Element {
  const [limit, setLimit] = useState(20)
  const unknown = translate('stats.usage.unknown', 'Unknown')
  const groups = groupUsageHistory(
    rows,
    'session',
    translate('stats.usage.session.unavailable', 'Session attribution unavailable')
  ).sort((a, b) => (b.rows.at(-1)?.day ?? '').localeCompare(a.rows.at(-1)?.day ?? ''))
  const sessions = groups.map((group) => {
    const models = new Set(group.rows.map((row) => row.model))
    const projects = new Set(group.rows.map((row) => row.projectKey))
    const days = group.rows.map((row) => row.day).sort()
    const accounts = new Set(group.rows.map(usageHistoryAccountKey))
    const first = group.rows[0]
    return {
      sessionId: group.key,
      label: group.label,
      provider: group.rows[0]?.provider,
      accountLabel:
        accounts.size === 1 && first
          ? `${first.accountId ? '' : `${getAgentLabel(first.provider)} · `}${usageHistoryAccountLabel(first, accountLabels)}`
          : translate('stats.usage.account.multiple', 'Multiple accounts'),
      lastActiveAt: days.at(-1) ?? '',
      projectLabel:
        projects.size === 1
          ? (group.rows[0]?.projectLabel ?? unknown)
          : translate('stats.usage.session.multipleProjects', 'Multiple projects'),
      model:
        models.size === 1
          ? (group.rows[0]?.model ?? unknown)
          : translate('stats.usage.session.multipleModels', 'Multiple models'),
      inputTokens: group.newInputTokens + group.cacheReadTokens + group.cacheWriteTokens,
      outputTokens: group.outputTokens,
      group
    }
  })
  return (
    <div className="space-y-2">
      <UsageRecentSessionsTable
        title={translate('stats.usage.session.title', 'Session drilldown')}
        description={translate(
          'stats.usage.session.description',
          'Tokens match the selected period, account, provider, model, project and day. Select the last recorded day to inspect a session.'
        )}
        headings={[
          translate('stats.usage.session.lastDay', 'Last recorded day'),
          translate('stats.usage.filter.project', 'Project'),
          translate('stats.usage.filter.model', 'Model'),
          translate('stats.usage.session.activity', 'Events / turns'),
          translate('stats.usage.session.input', 'All input'),
          translate('stats.usage.session.output', 'Output'),
          translate('stats.usage.tokens', 'Tokens')
        ]}
        unknownModel={unknown}
        rows={sessions.slice(0, limit)}
        getActivity={(row) =>
          row.group.rows.reduce((total, entry) => total + entry.activityCount, 0)
        }
        getTrailingTokens={(row) => row.group.totalTokens}
        getSessionTimeLabel={(row) => row.lastActiveAt}
        getModelSuffix={renderSessionProvider}
        renderDetails={(row) => renderSessionDetails(row, accountLabels)}
      />
      {sessions.length > limit ? (
        <Button variant="outline" size="sm" onClick={() => setLimit((current) => current + 20)}>
          {translate('stats.usage.session.showMore', 'Show more sessions')}
        </Button>
      ) : null}
    </div>
  )
}

function renderSessionProvider(row: { accountLabel: string }): React.JSX.Element {
  return <span className="block text-xs">{row.accountLabel}</span>
}

function renderSessionDetails(
  row: { label: string; group: UsageHistoryGroup },
  accountLabels: ReadonlyMap<string, string>
): React.JSX.Element {
  const unknown = translate('stats.usage.unknown', 'Unknown')
  return (
    <div className="space-y-2 text-xs">
      <p className="break-all font-medium text-foreground">{row.label}</p>
      <p className="text-muted-foreground">
        {translate('stats.usage.session.estimate', 'API-equivalent estimate: {{cost}}', {
          cost: formatUsageCost(row.group.apiEquivalentCostUsd)
        })}
      </p>
      {row.group.rows.map((entry) => (
        <div
          key={`${entry.day}:${entry.model}:${entry.projectKey}:${usageHistoryAccountKey(entry)}`}
          className="flex flex-wrap justify-between gap-2 text-muted-foreground"
        >
          <span>
            {entry.day} · {usageHistoryAccountLabel(entry, accountLabels)} · {entry.projectLabel} ·{' '}
            {entry.model ?? unknown}
          </span>
          <span className="tabular-nums">{formatUsageTokens(entry.totalTokens)}</span>
        </div>
      ))}
    </div>
  )
}
