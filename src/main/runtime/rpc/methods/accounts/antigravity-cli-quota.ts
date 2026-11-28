import { defineMethod } from '../../core'
import {
  AntigravityQuotaRefreshParams,
  AntigravityQuotaSettingsParams
} from '../../../../../shared/rpc-contract/accounts/antigravity-accounts-params'

export const ANTIGRAVITY_CLI_QUOTA_METHODS = [
  defineMethod({
    name: 'accounts.antigravitySetQuotaAutoRefresh',
    permission: 'accounts-admin',
    params: AntigravityQuotaSettingsParams,
    handler: async ({ enabled }, { runtime }) => {
      const store = runtime.requireStore()
      if (!store.updateSettingsAndFlush) {
        throw new Error('Antigravity quota settings are unavailable on this host.')
      }
      await store.updateSettingsAndFlush({ antigravityCliQuotaEnabled: enabled })
      return { enabled }
    }
  }),
  defineMethod({
    name: 'accounts.antigravityRefreshQuota',
    permission: 'accounts-admin',
    params: AntigravityQuotaRefreshParams,
    handler: async (target, { runtime }) => {
      await runtime
        .requireUsageRateLimits()
        .refreshAntigravityCliQuota(
          target ? { runtime: target.runtime, wslDistro: target.wslDistro ?? null } : undefined
        )
      return { refreshed: true }
    }
  })
] as const
