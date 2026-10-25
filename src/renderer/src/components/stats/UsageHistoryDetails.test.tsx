// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { UsageHistoryRow } from '../../../../shared/usage-history-types'
import { UsageHistoryFilter } from './UsageHistoryFilter'
import { UsageHistorySessions } from './UsageHistoryDetails'

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
