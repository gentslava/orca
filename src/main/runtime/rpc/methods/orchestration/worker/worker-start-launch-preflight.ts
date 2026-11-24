import { resolveWorkerRoleParams } from '../../../../../../shared/orchestration-worker-roles'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { resolveWorkerStartModeOnHost } from '../structured-workers/orchestration-worker-start-mode'
import type { AgentLaunchModeReceipt as WorkerStartModeReceipt } from '../../../../../../shared/agent-launch/contracts/agent-launch-intent'
import type { WorkerStartInput } from './start/worker-start-input'
import { resolveWorkerConfiguredAgentParams } from './start/launch/worker-configured-agent-preflight'
import { probeWorkerOpenCodeModelLaunchSupport } from './start/launch/worker-opencode-model-preflight'
import { preflightStructuredWorkerFast } from './worker-structured-fast-preflight'
import { prepareLocalWorkerStart } from './start/launch/worker-start-validation'
import type { WorkerWorktreeCreationTarget } from './start/placement/worker-worktree-creation'

export async function preflightLocalWorkerStartLaunch(args: {
  params: WorkerStartInput
  runtime: OrcaRuntimeService
  coordinatorWorktreeId: string
  requestedWorktree: string
  createsWorktree: boolean
  creationTargetFor: (callerWorktreeId: string) => Promise<WorkerWorktreeCreationTarget>
  mode: WorkerStartModeReceipt
}) {
  const { params, runtime, coordinatorWorktreeId, requestedWorktree, createsWorktree, mode } = args
  const launchParams = await resolveWorkerConfiguredAgentParams(runtime, params, async () => {
    return createsWorktree
      ? { repo: (await args.creationTargetFor(coordinatorWorktreeId)).repoSelector }
      : {
          worktree: requestedWorktree === 'current' ? `id:${coordinatorWorktreeId}` : requestedWorktree
        }
  })
  let openCodeModelLaunchSupported = false
  if (!createsWorktree && launchParams.agent === 'opencode' && launchParams.model) {
    openCodeModelLaunchSupported = await probeWorkerOpenCodeModelLaunchSupport(
      runtime,
      launchParams,
      { worktree: requestedWorktree === 'current' ? `id:${coordinatorWorktreeId}` : requestedWorktree }
    )
  }

  let fastWorkspace: Awaited<ReturnType<typeof runtime.showManagedTerminalWorkspace>> | undefined
  let fastWorkerMode: WorkerStartModeReceipt | undefined
  let structuredFastModeSupported = false
  let structuredFastServiceTier: string | undefined
  if (
    launchParams.fastMode !== undefined &&
    (launchParams.agent === 'claude' || launchParams.agent === 'codex') &&
    mode.mode === 'structured'
  ) {
    if (createsWorktree) {
      throw new OrchestrationError(
        'capability_unsupported',
        'Claude and Codex Fast need an existing workspace with a verified model catalog. No effects were applied.',
        { effectsApplied: false }
      )
    }
    fastWorkspace = await runtime.showManagedTerminalWorkspace(
      requestedWorktree === 'current' ? `id:${coordinatorWorktreeId}` : requestedWorktree
    )
    fastWorkerMode = await resolveWorkerStartModeOnHost(
      runtime,
      mode,
      fastWorkspace.id,
      launchParams.agent
    )
    if (fastWorkerMode.mode === 'structured') {
      structuredFastServiceTier = await preflightStructuredWorkerFast({
        runtime,
        agent: launchParams.agent,
        model: launchParams.model,
        fastMode: launchParams.fastMode,
        worktree: `id:${fastWorkspace.id}`
      })
      structuredFastModeSupported = true
    }
  }

  const prepared = prepareLocalWorkerStart({
    params: launchParams,
    createsWorktree,
    runtime,
    openCodeModelLaunchSupported,
    structuredFastModeSupported,
    structuredFastServiceTier
  })
  function preflightTerminal(
    workerMode: WorkerStartModeReceipt,
    creationTarget?: WorkerWorktreeCreationTarget,
    worktree?: { id: string }
  ): Promise<void> | undefined {
    if (
      prepared.agent &&
      (workerMode.mode === 'terminal' || createsWorktree) &&
      (params.role || params.fastMode !== undefined)
    ) {
      return runtime.preflightOrchestrationWorkerLaunch(
        prepared.agent,
        prepared.launch.preferences,
        createsWorktree
          ? { repo: creationTarget?.repoSelector ?? params.repo }
          : worktree
            ? { worktree: `id:${worktree.id}` }
            : {}
      )
    }
    return undefined
  }
  return { ...prepared, fastWorkspace, fastWorkerMode, preflightTerminal }
}

export function applyWorkerStartRole(runtime: OrcaRuntimeService, params: WorkerStartInput) {
  if (params.role) {
    try {
      return resolveWorkerRoleParams(
        params,
        runtime.requireStore().getSettings().orchestrationWorkerRoles
      )
    } catch (error) {
      throw new OrchestrationError(
        'invalid_argument',
        error instanceof Error ? error.message : 'Invalid worker role profile.',
        { effectsApplied: false }
      )
    }
  }
  return params
}
