import type { GlobalSettings } from './global-settings-types'

export const DEFAULT_PROVIDER_QUOTA_SETTINGS = {
  opencodeSessionCookie: '',
  opencodeWorkspaceId: '',
  minimaxGroupId: '',
  minimaxUsageModels: 'general',
  minimaxEndpoint: 'overseas',
  zcodePlanSite: 'zai',
  claudeOAuthUsageEnabled: true
} satisfies Pick<
  GlobalSettings,
  | 'opencodeSessionCookie'
  | 'opencodeWorkspaceId'
  | 'minimaxGroupId'
  | 'minimaxUsageModels'
  | 'minimaxEndpoint'
  | 'zcodePlanSite'
  | 'claudeOAuthUsageEnabled'
>
