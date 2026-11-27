import { StatsPane } from './StatsPane'
import { useAppStore } from '../../store'
import { useTranslate } from '@/i18n/use-translate'
import type { SettingsHostScope } from '../settings/host-scope/settings-host-scope'
import { resolveAccountOwner } from '@/runtime/provider-accounts/ownership/wsl-host-account-owner'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'
import {
  getUsageOwnerHostScope,
  useAccountOwnerUsage
} from '../status-bar/usage/use-owner-usage-rate-limits'
import { UsageAccountQuotas } from './UsageAccountQuotas'

export function AccountQuotaStatsPane({
  hostScope
}: {
  hostScope: SettingsHostScope
}): React.JSX.Element {
  const t = useTranslate()
  const localRateLimits = useAppStore((state) => state.rateLimits)
  const refreshRateLimits = useAppStore((state) => state.refreshRateLimits)
  const fetchInactiveClaude = useAppStore((state) => state.fetchInactiveClaudeAccountUsage)
  const fetchInactiveCodex = useAppStore((state) => state.fetchInactiveCodexAccountUsage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const environments = useAppStore((state) => state.runtimeEnvironments)
  const selectedHost =
    hostScope.target.kind === 'local' && isWebClientLocation() && environments?.length === 1
      ? { kind: 'environment' as const, environmentId: environments[0].id }
      : hostScope.target
  const accountOwner = resolveAccountOwner(selectedHost, environments ?? [])
  const { rateLimits, remoteOwner, refreshRemote, accounts, accountsUnverifiable } =
    useAccountOwnerUsage(accountOwner, localRateLimits, true)
  return (
    <div className="@container space-y-5">
      <UsageAccountQuotas
        rateLimits={rateLimits}
        accounts={accounts}
        accountsUnverifiable={accountsUnverifiable}
        localOwner={remoteOwner === null}
        ownerLabel={remoteOwner?.label ?? t('stats.usage.localHost', 'This device')}
        onRefresh={
          refreshRemote ??
          (async () => {
            await refreshRateLimits()
            await Promise.all([fetchInactiveClaude(), fetchInactiveCodex()])
          })
        }
        onManage={() => {
          const accountHost = getUsageOwnerHostScope(remoteOwner)
          if (!accountHost) {
            return
          }
          openSettingsTarget({
            pane: 'accounts',
            repoId: null,
            hostScope: accountHost
          })
          openSettingsPage()
        }}
      />
      <StatsPane hostScope={hostScope} />
    </div>
  )
}
