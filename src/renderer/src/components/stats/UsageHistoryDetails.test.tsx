// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { UsageHistoryRow } from '../../../../shared/usage-history-types'
import { UsageHistoryFilter } from './UsageHistoryFilter'
import {
  UsageHistorySessions,
  UsageHistoryDailyChart,
  UsageHistoryBreakdowns
} from './UsageHistoryDetails'

afterEach(cleanup)

function row(sessionId: string, day: string): UsageHistoryRow {
  return {
    provider: 'codex',
    day,
    sessionId,
    accountId: null,
    model: 'gpt-5.4',
    projectKey: 'folder',
    projectLabel: 'Folder',
    inOrca: true,
    activityCount: 1,
    newInputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 10,
    reasoningTokens: 0,
    totalTokens: 110,
    apiEquivalentCostUsd: null
  }
}

it('shows the applied model when a new selection has no matching filter option', () => {
  render(
    <UsageHistoryFilter
      label="Model"
      allLabel="All models"
      value="missing-model"
      options={[]}
      onChange={vi.fn()}
    />
  )
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('missing-model')
})

it('paginates sessions by the latest recorded day even when snapshots arrive out of day order', () => {
  const rows = [
    row('recent', '2026-10-24'),
    row('recent', '2026-09-01'),
    ...Array.from({ length: 20 }, (_, index) => row(`older-${index}`, '2026-10-20'))
  ]
  render(<UsageHistorySessions rows={rows} accountLabels={new Map()} />)
  const table = screen.getByRole('table')
  const first = within(table).getAllByRole('row')[1]
  expect(first).toHaveTextContent('2026-10-24')
  fireEvent.click(within(first).getByRole('button'))
  expect(first.parentElement).toHaveTextContent('recent')
})

it('draws separate provider series with gaps and exposes exact hover and keyboard day values', () => {
  const onDay = vi.fn()
  const rows = [
    row('codex-1', '2026-10-23'),
    { ...row('codex-2', '2026-10-25'), totalTokens: 220 },
    { ...row('claude-1', '2026-10-24'), provider: 'claude' as const, totalTokens: 330 }
  ]
  const view = render(
    <UsageHistoryDailyChart
      rows={rows}
      range="7d"
      selectedDay={null}
      today="2026-10-25"
      onDay={onDay}
    />
  )
  expect(view.container.querySelectorAll('[data-provider-series]')).toHaveLength(2)
  expect(view.container.querySelectorAll('[data-provider-series="codex"] polyline')).toHaveLength(0)
  expect(view.container.querySelectorAll('[data-provider-series="codex"] ellipse')).toHaveLength(2)
  const day = screen.getByRole('button', { name: '2026-10-24: 330 tokens' })
  fireEvent.mouseEnter(day)
  expect(screen.getByTestId('usage-history-readout')).toHaveTextContent('Claude')
  expect(screen.getByTestId('usage-history-readout')).toHaveTextContent('330')
  expect(screen.getByTestId('usage-history-readout')).toHaveTextContent('No recorded data')
  fireEvent.focus(day)
  fireEvent.keyDown(day, { key: 'ArrowRight' })
  expect(screen.getByRole('button', { name: '2026-10-25: 220 tokens' })).toHaveFocus()
  fireEvent.click(day)
  expect(onDay).toHaveBeenCalledWith('2026-10-24')
})

it('keeps unpriced days inspectable in cost mode and explicitly labels partial estimates', () => {
  const rows = [
    row('unpriced', '2026-10-24'),
    { ...row('priced', '2026-10-25'), apiEquivalentCostUsd: 0.02 },
    row('partial', '2026-10-25')
  ]
  render(
    <UsageHistoryDailyChart
      rows={rows}
      range="7d"
      selectedDay={null}
      today="2026-10-25"
      onDay={vi.fn()}
    />
  )
  fireEvent.click(screen.getByRole('radio', { name: 'API estimate' }))
  expect(screen.getByRole('status')).toHaveTextContent('priced portion')
  const unpriced = screen.getByRole('button', { name: '2026-10-24: n/a API-equivalent estimate' })
  expect(unpriced).toBeEnabled()
  fireEvent.focus(unpriced)
  expect(screen.getByTestId('usage-history-readout')).toHaveTextContent('Price unavailable')
  expect(
    screen.getByRole('button', { name: '2026-10-25: $0.02 * API-equivalent estimate' })
  ).toBeEnabled()
})

it('compares model and project shares from selected token totals', () => {
  const rows = [
    {
      ...row('large', '2026-10-24'),
      totalTokens: 300,
      model: 'large-model',
      projectKey: 'large',
      projectLabel: 'Large project'
    },
    {
      ...row('small', '2026-10-24'),
      totalTokens: 100,
      model: 'small-model',
      projectKey: 'small',
      projectLabel: 'Small project'
    }
  ]
  const select = vi.fn()
  render(
    <UsageHistoryBreakdowns
      rows={rows}
      onModel={select}
      onProject={select}
      onAccount={select}
      accountLabels={new Map()}
    />
  )
  const project = screen.getByRole('button', { name: /Large project/ })
  expect(project).toHaveTextContent('75%')
  expect(screen.getByRole('button', { name: /small-model/ })).toHaveTextContent('25%')
  expect(project.querySelector('[data-usage-share]')).toHaveAttribute('data-usage-share', '75')
  fireEvent.click(project)
  expect(select).toHaveBeenCalledWith('large')
})
