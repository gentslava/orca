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

function roleCatalog(agent: string | undefined): AgentSessionOptionCatalog | null {
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
    : seed
}

export function useWorkerRoleModelCatalog(
  agent: string | undefined
): AgentSessionOptionCatalog | null {
  const settings = useAppStore((state) => state.settings)
  const [loaded, setLoaded] = useState<{
    agent: string
    settings: GlobalSettings | null
    catalog: AgentSessionOptionCatalog | null
  } | null>(null)
  useEffect(() => {
    let current = true
    if (!agent || !isTuiAgent(agent)) {
      return
    }
    void ensureLocalRuntimeCapabilities()
      .then(async (capabilities) => {
        if (
          !current ||
          !capabilities?.includes(AGENT_SESSION_MODEL_CATALOG_SAVED_ONLY_RUNTIME_CAPABILITY)
        ) {
          return
        }
        await preloadHostModelCatalogSnapshots(LOCAL, [agent], { savedOnly: true })
        if (current) {
          setLoaded({ agent, settings, catalog: roleCatalog(agent) })
        }
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [agent, settings])
  return loaded !== null && loaded.agent === agent && loaded.settings === settings
    ? loaded.catalog
    : roleCatalog(agent)
}
