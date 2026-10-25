import type { AgentSessionRecord } from '../../../shared/agent-session-record'
import type { AgentModelCatalogLiveListing } from './agent-model-catalog-store'
import type { AgentModelCatalogServiceDeps } from './agent-model-catalog-service-contract'
import { recordConfiguredDefault } from './agent-model-catalog-workspace'

export function saveAgentModelCatalogLiveListing(
  deps: AgentModelCatalogServiceDeps,
  recordingDefaults: Map<string, Promise<void>>,
  record: AgentSessionRecord,
  listing: AgentModelCatalogLiveListing,
  fingerprint: string
): void {
  const { configuredDefault, ...listed } = listing
  const saved = deps.store.recordSuccess(
    fingerprint,
    record.provider,
    { ...listed, origin: 'live-session' },
    'live'
  )
  if (saved && configuredDefault !== undefined) {
    // Preserve report order when learning configured defaults.
    const recording = (recordingDefaults.get(fingerprint) ?? Promise.resolve())
      .then(() => recordConfiguredDefault(deps, record, fingerprint, configuredDefault))
      .catch(() => {})
      .then(() => {
        if (recordingDefaults.get(fingerprint) === recording) {
          recordingDefaults.delete(fingerprint)
        }
      })
    recordingDefaults.set(fingerprint, recording)
  }
}
