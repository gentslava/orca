import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import type { StructuredAgentSessionMutate } from './mobile-structured-agent-session-rpc'
import type { HostModelCatalogCache } from './use-mobile-host-model-catalog-upgrade'

export type MobileStructuredAgentOptionsArgs = {
  modelCatalogCache?: HostModelCatalogCache | null
  agent: string | null
  client: RpcClient | null
  sessionId: string | null
  enabled: boolean
  fence: number | null
  mutate: StructuredAgentSessionMutate
  optionStamp?: string
  turnId: string | null
  hasTurn?: boolean
  unloadedTurnRevisions: number | undefined
  hostSupport: Pick<
    StructuredAgentSessionHostSupport,
    | 'permissionModes'
    | 'permissionOwn'
    | 'coherentModelCatalog'
    | 'statusFeed'
    | 'defaultModel'
    | 'modelEffortDiscovery'
    | 'sendSelection'
    | 'sendOptions'
  > | null
}
