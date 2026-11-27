import { defineFixture } from '../../component-fixtures/component-fixture'
import { createEmptyRateLimitState } from '../../../../shared/agent-usage/rate-limits/rate-limit-state-factory'
import type { CodexManagedAccountSummary } from '../../../../shared/agent-accounts/managed-account-types'
import type { ProviderRateLimits } from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { UsageAccountQuotas } from './UsageAccountQuotas'

const checkedAt = Date.UTC(2026, 9, 28, 6)
function quota(provider: ProviderRateLimits['provider'], usedPercent: number): ProviderRateLimits {
  return {
    provider,
    planType: 'plus',
    status: 'ok',
    error: null,
    updatedAt: checkedAt,
    session: {
      usedPercent,
      windowMinutes: 300,
      resetsAt: checkedAt + 3600000,
      resetDescription: null
    },
    weekly: {
      usedPercent: usedPercent + 10,
      windowMinutes: 10080,
      resetsAt: checkedAt + 86400000,
      resetDescription: null
    }
  }
}

export const reportedWindows = defineFixture({
  width: 800,
  render: () => (
    <div className="@container bg-background p-5">
      <UsageAccountQuotas
        rateLimits={createEmptyRateLimitState({
          codex: quota('codex', 27),
          claude: quota('claude', 42)
        })}
        ownerLabel="Build server"
        onRefresh={() => {}}
        onManage={() => {}}
      />
    </div>
  )
})

export const savedProviderAccounts = defineFixture({
  width: 800,
  render: () => (
    <div className="@container bg-background p-5">
      <UsageAccountQuotas
        accounts={{
          claude: { accounts: [], activeAccountId: null },
          codex: {
            accounts: [
              { id: 'work', email: 'work@example.test' },
              { id: 'personal', email: 'personal@example.test' },
              { id: 'unread', email: 'unread@example.test' }
            ].map<CodexManagedAccountSummary>((account) => ({
              ...account,
              managedHomeRuntime: 'host',
              createdAt: checkedAt,
              updatedAt: checkedAt,
              lastAuthenticatedAt: checkedAt
            })),
            activeAccountId: 'work'
          },
          rateLimits: null
        }}
        rateLimits={createEmptyRateLimitState({
          muse: quota('muse', 24),
          codex: quota('codex', 31),
          inactiveCodexAccounts: [
            {
              accountId: 'personal',
              rateLimits: quota('codex', 64),
              updatedAt: checkedAt,
              isFetching: false
            }
          ]
        })}
        ownerLabel="Build server"
        onRefresh={() => {}}
        onManage={() => {}}
      />
    </div>
  )
})
