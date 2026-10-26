import type { AgentStatusIpcPayload } from '../../../shared/agent-status-types'
import { OrcaRuntimeWithTerminalDrivers } from '../terminal/driver/terminal-driver-resources'
import type { RuntimeConstructionBindings as HostBindings } from './runtime-construction-dependencies'

export abstract class OrcaRuntimeWithAgentProviderSessionRows extends OrcaRuntimeWithTerminalDrivers {
  protected readonly getAgentProviderSessionSnapshotFn!:
    | HostBindings['getAgentProviderSessionSnapshot']
    | null

  protected readonly getAgentProviderSessionRowsForPaneFn!:
    | HostBindings['getAgentProviderSessionRowsForPane']
    | null

  /** Every provider-session row this host holds, resume-identity-only rows included. */
  getAgentProviderSessionRows(): AgentStatusIpcPayload[] {
    return this.getAgentProviderSessionSnapshotFn?.() ?? []
  }

  /** Agent status rows this host holds for a pane, from hooks, OSC and titles alike. */
  getAgentStatusRowsForPane(paneKey: string): AgentStatusIpcPayload[] {
    return this.getAgentProviderSessionRowsForPaneFn?.(paneKey) ?? []
  }
}
