import { useEffect, useState } from 'react'
import { getAgentSessionOptionLaunchCatalog } from '../../../../shared/agent-session-option-launch'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { AgentSessionOptionCatalog } from '../../../../shared/agent-session-option-catalog'
import {
  applyStructuredAgentSessionModelCatalog,
  createStructuredAgentSessionOptionState
} from '../../../../shared/structured-agent-session-options'
import { AGENT_SESSION_MODEL_CATALOG_SAVED_ONLY_RUNTIME_CAPABILITY } from '../../../../shared/structured-agent-session-surface-capabilities'
import {
  preloadHostModelCatalogSnapshots,
  readHostModelCatalogSnapshot
} from '@/runtime/host-model-catalog-snapshots'
import { ensureLocalRuntimeCapabilities } from '@/runtime/local-runtime-capabilities'
import { useAppStore } from '@/store'
import type { GlobalSettings } from '../../../../shared/global-settings-types'

const LOCAL = { kind: 'local' } as const

function roleCatalog(
  agent: string | undefined,
  allowSeed = true
): AgentSessionOptionCatalog | null {
  if (!agent || !isTuiAgent(agent)) {
    return null
  }
  const seed = getAgentSessionOptionLaunchCatalog(agent)
  const saved = readHostModelCatalogSnapshot(LOCAL, agent, { newLaunch: false, seedsModel: true })
  return seed && saved
    ? applyStructuredAgentSessionModelCatalog(
        createStructuredAgentSessionOptionState(agent, seed),
        seed,
        saved,
        { newLaunch: false, coherentCatalog: true }
      ).catalog
    : allowSeed
      ? seed
      : null
}

export function useWorkerRoleModelCatalog(
  agent: string | undefined,
  enabled = true
): { catalog: AgentSessionOptionCatalog | null; refresh: () => void; isRefreshing: boolean } {
  const settings = useAppStore((state) => state.settings)
  const [demand, setDemand] = useState<{
    agent: string
    settings: GlobalSettings | null
    request: number
  } | null>(null)
  const request =
    demand !== null && demand.agent === agent && demand.settings === settings ? demand.request : 0
  const [loaded, setLoaded] = useState<{
    agent: string
    settings: GlobalSettings | null
    catalog: AgentSessionOptionCatalog | null
    request: number
  } | null>(null)
  useEffect(() => {
    let current = true
    if (!enabled || !agent || !isTuiAgent(agent)) {
      return
    }
    void ensureLocalRuntimeCapabilities()
      .then(async (capabilities) => {
        if (!current) {
          return
        }
        const canList =
          capabilities?.includes(AGENT_SESSION_MODEL_CATALOG_SAVED_ONLY_RUNTIME_CAPABILITY) === true
        if (canList) {
          await preloadHostModelCatalogSnapshots(
            LOCAL,
            [agent],
            request > 0 ? { awaitListing: true } : { savedOnly: true }
          )
        }
        if (current) {
          setLoaded({ agent, settings, request, catalog: roleCatalog(agent, !canList) })
        }
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [agent, settings, enabled, request])
  const matches =
    loaded !== null &&
    loaded.agent === agent &&
    loaded.settings === settings &&
    loaded.request === request
  return {
    catalog:
      loaded !== null && loaded.agent === agent && loaded.settings === settings
        ? loaded.catalog
        : roleCatalog(agent),
    isRefreshing: enabled && request > 0 && !matches,
    refresh: () => {
      if (enabled && agent && isTuiAgent(agent)) {
        setDemand((current) => ({ agent, settings, request: (current?.request ?? 0) + 1 }))
      }
    }
  }
}
