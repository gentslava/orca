import type {
  InactiveAccountUsage,
  ProviderRateLimits,
  RateLimitRuntimeTarget,
  RateLimitState
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { ProviderAccountsSnapshot } from '@/runtime/provider-accounts/observations/runtime-provider-accounts-client'
import {
  buildClaudeStatusSwitchGroups,
  normalizeClaudeStatusRuntimeTarget
} from '../status-bar/accounts/status-bar-claude-accounts'
import {
  buildCodexStatusSwitchGroups,
  normalizeCodexStatusRuntimeTarget
} from '../status-bar/accounts/status-bar-codex-accounts'
import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import { USAGE_PROVIDER_KEYS } from '../status-bar/usage/owner-usage-rate-limits'
import {
  getVisibleUsageProvider,
  type UsageProviderSettings
} from '../status-bar/composition/status-bar-provider-visibility'

export type UsageAccountQuotaRow = {
  key: string
  identity: string
  runtimeLabel?: string
  active: boolean
  provider: ProviderRateLimits
}

type ClaudeAccountGroup = ReturnType<typeof buildClaudeStatusSwitchGroups>[number]
type AccountGroup = Omit<ClaudeAccountGroup, 'targets'> & {
  targets: readonly Pick<
    ClaudeAccountGroup['targets'][number],
    'id' | 'label' | 'active' | 'hint'
  >[]
}

function sameRuntime(left: RateLimitRuntimeTarget, right: RateLimitRuntimeTarget): boolean {
  return left.runtime === right.runtime && left.wslDistro === right.wslDistro
}

function managedQuotaRows(
  {
    provider,
    groups,
    current,
    inactive,
    target,
    systemIdentity,
    unverifiable
  }: {
    provider: 'claude' | 'codex'
    groups: AccountGroup[]
    current: ProviderRateLimits | null
    inactive: InactiveAccountUsage[]
    target: RateLimitRuntimeTarget
    systemIdentity?: string | null
    unverifiable: boolean
  },
  t: Translate = translate
): UsageAccountQuotaRow[] {
  return groups.flatMap((group) =>
    group.targets.flatMap((account) => {
      const currentAccount = account.active && sameRuntime(group.runtimeTarget, target)
      if (account.id === null && (!currentAccount || !current)) {
        return []
      }
      const cached = inactive.find((entry) => entry.accountId === account.id)
      const known = currentAccount ? current : cached?.rateLimits
      const limits: ProviderRateLimits =
        known && !unverifiable
          ? known
          : {
              provider,
              session: null,
              weekly: null,
              updatedAt: known?.updatedAt ?? cached?.updatedAt ?? 0,
              status: !unverifiable && cached?.isFetching ? 'fetching' : 'unavailable',
              error: unverifiable
                ? (current?.error ??
                  t('stats.usage.quota.ownerUnverifiable', 'The account host cannot be verified.'))
                : (account.hint ?? null),
              ...(unverifiable ? { usageMetadata: { unverifiableOwner: true } } : {})
            }
      return [
        {
          key: `${provider}:${group.key}:${account.id ?? 'system'}`,
          identity:
            account.id === null && systemIdentity && group.runtimeTarget.runtime === 'host'
              ? `${account.label} · ${systemIdentity}`
              : account.label,
          runtimeLabel:
            group.runtimeTarget.runtime === 'host'
              ? group.label === 'This device'
                ? t('stats.usage.localHost', 'This device')
                : group.label
              : group.runtimeTarget.wslDistro
                ? `WSL ${group.runtimeTarget.wslDistro}`
                : t('stats.usage.quota.defaultWsl', 'WSL default'),
          active: account.active,
          provider: limits
        }
      ]
    })
  )
}

export function buildUsageAccountQuotaRows(
  limits: RateLimitState,
  accounts: ProviderAccountsSnapshot | null,
  unverifiable = false,
  settings?: Partial<UsageProviderSettings> | null,
  ownerLabel?: string,
  t: Translate = translate
): UsageAccountQuotaRow[] {
  const fallback = (provider: ProviderRateLimits | null): UsageAccountQuotaRow[] =>
    provider && getVisibleUsageProvider(provider.provider, provider, { ...settings, ...limits })
      ? [
          {
            key: `${provider.provider}:current`,
            identity: t(
              'stats.usage.quota.currentAccount',
              'Current account · identity unavailable'
            ),
            active: true,
            provider
          }
        ]
      : []
  const claude =
    accounts?.claude && !accounts.failedProviders?.includes('claude')
      ? managedQuotaRows(
          {
            provider: 'claude',
            groups: buildClaudeStatusSwitchGroups(accounts.claude, limits.claudeTarget, {
              hostLabel: ownerLabel
            }),
            current: limits.claude,
            inactive: limits.inactiveClaudeAccounts,
            target: normalizeClaudeStatusRuntimeTarget(accounts.claude, limits.claudeTarget),
            systemIdentity: accounts.claude.systemDefaultEmail,
            unverifiable
          },
          t
        )
      : fallback(limits.claude)
  const codex =
    accounts?.codex && !accounts.failedProviders?.includes('codex')
      ? managedQuotaRows(
          {
            provider: 'codex',
            groups: buildCodexStatusSwitchGroups(accounts.codex, limits.codexTarget, {
              hostLabel: ownerLabel
            }),
            current: limits.codex,
            inactive: limits.inactiveCodexAccounts,
            target: normalizeCodexStatusRuntimeTarget(accounts.codex, limits.codexTarget),
            systemIdentity: accounts.codex.systemDefault?.email,
            unverifiable
          },
          t
        )
      : fallback(limits.codex)
  return [
    ...claude,
    ...codex,
    ...USAGE_PROVIDER_KEYS.filter((key) => key !== 'claude' && key !== 'codex').flatMap((key) =>
      fallback(limits[key])
    )
  ]
}
