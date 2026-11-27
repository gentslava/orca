import type { RuntimeStatus } from '../../../../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import { isTuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent-config'
import {
  ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
  ORCHESTRATION_FEDERATION_RUNTIME_CAPABILITY
} from '../../../../../../shared/orchestration/orchestration-runtime-capabilities'
import { orchestrationMigrationData } from '../../../../../../shared/orchestration/orchestration-rpc-contract'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type { OrchestrationWorkerServer } from '../../../../orchestration/federation/environment-transport'
import type { WorkerStartInput } from '../worker/start/worker-start-input'
import {
  assertWorkerLaunchPreferencesRuntimeSupported,
  parseWorkerLaunchPreflight,
  resolveFederatedWorkerLaunchPreferences
} from '../worker/start/launch/worker-launch-preferences'

export async function preflightFederatedWorkerLaunch(args: {
  params: WorkerStartInput
  runtime: OrcaRuntimeService
  server: OrchestrationWorkerServer
  status: RuntimeStatus
  worktree: string
  preflightTimeoutMs: number
  createsWorktree: boolean
}) {
  const { runtime, server, status, worktree, preflightTimeoutMs } = args
  const pairingFence = { expectedEnvironmentPairingRevision: server.pairingRevision }
  if (!status.capabilities?.includes(ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY)) {
    throw new OrchestrationError(
      'orchestration_migration_required',
      `Connected server ${server.name} does not support the current orchestration contract. No effects were applied.`,
      orchestrationMigrationData('runtime_capability_missing')
    )
  }
  if (!status.capabilities?.includes(ORCHESTRATION_FEDERATION_RUNTIME_CAPABILITY)) {
    throw new OrchestrationError(
      'capability_unsupported',
      `Connected server ${server.name} does not support orchestration federation.`
    )
  }
  const plan = resolveFederatedWorkerLaunchPreferences({
    params: args.params,
    createsWorktree: args.createsWorktree,
    capabilities: status.capabilities,
    serverName: server.name
  })
  const params = { ...args.params, model: plan.model, effort: plan.effort }
  let { requestedLaunch } = plan
  assertWorkerLaunchPreferencesRuntimeSupported({
    model: params.model,
    effort: params.effort,
    fastMode: params.fastMode,
    role: params.role,
    capabilities: status.capabilities,
    serverName: server.name
  })
  if (params.role || params.fastMode !== undefined) {
    requestedLaunch = parseWorkerLaunchPreflight(
      await runtime.callOrchestrationWorkerServer(
        server.environmentId,
        'orchestration.workerLaunchPreflight',
        {
          worktree,
          name: params.name,
          repo: params.repo,
          baseBranch: params.baseBranch,
          setup: params.setup,
          terminal: params.terminal,
          agent: params.agent,
          role: params.role,
          model: params.model,
          effort: params.effort,
          fastMode: params.fastMode
        },
        preflightTimeoutMs,
        undefined,
        { contractVerified: true, ...pairingFence }
      )
    )
    if (
      requestedLaunch.role !== params.role ||
      requestedLaunch.requested.model !== (params.model ?? null) ||
      requestedLaunch.requested.effort !== (params.effort ?? null) ||
      requestedLaunch.requested.fastMode !== params.fastMode ||
      (isTuiAgent(params.agent) && requestedLaunch.requested.agent !== params.agent)
    ) {
      throw new OrchestrationError(
        'capability_unsupported',
        'The execution host cannot honor the requested role launch. No effects were applied.',
        { effectsApplied: false }
      )
    }
  }
  return { ...plan, requestedLaunch }
}
