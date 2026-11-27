import { resolveWorkerRoleParams } from '../../../../../../shared/orchestration-worker-roles'
import type { TuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type { AgentLaunchModeReceipt as WorkerStartModeReceipt } from '../../../../../../shared/agent-launch/contracts/agent-launch-intent'
import { lineageModeForResolvedAgent } from './start/worker-chat-lineage'
import { resolveWorkerConfiguredAgentParams } from './start/launch/worker-configured-agent-preflight'
import { probeWorkerOpenCodeModelLaunchSupport } from './start/launch/worker-opencode-model-preflight'
import type { WorkerWorktreeCreationTarget } from './start/placement/worker-worktree-creation'
import type { WorkerStartInput } from './start/worker-start-input'
import { preflightStructuredWorkerFast } from './worker-structured-fast-preflight'
import { prepareLocalWorkerStart } from './start/launch/worker-start-validation'
import { preflightWorkerAgentOnHost } from './start/launch/worker-agent-host-preflight'
import {
  refuseUnmatchedWorkerSelector,
  type WorkerStartSelectorLabel
} from './start/worker-start-selector-refusal'

export async function preflightLocalWorkerStartLaunch(args: {
  params: WorkerStartInput
  runtime: OrcaRuntimeService
  existingWorktree: string
  targetLabel: WorkerStartSelectorLabel
  createsWorktree: boolean
  creationTargetFor: () => Promise<WorkerWorktreeCreationTarget>
  mode: WorkerStartModeReceipt
  chatLineage?: boolean
}) {
  const { params, runtime, existingWorktree, createsWorktree, targetLabel } = args
  const launchParams = await refuseUnmatchedWorkerSelector(targetLabel, () =>
    resolveWorkerConfiguredAgentParams(runtime, params, async () =>
      createsWorktree
        ? { repo: (await args.creationTargetFor()).repoSelector }
        : { worktree: existingWorktree }
    )
  )
  let openCodeModelLaunchSupported = false
  if (!createsWorktree && launchParams.agent === 'opencode' && launchParams.model) {
    openCodeModelLaunchSupported = await refuseUnmatchedWorkerSelector(targetLabel, () =>
      probeWorkerOpenCodeModelLaunchSupport(runtime, launchParams, { worktree: existingWorktree })
    )
  }
  const mode = lineageModeForResolvedAgent(runtime, args.mode, {
    chatLineage: args.chatLineage,
    params,
    agent: launchParams.agent
  })

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
    fastWorkspace = await refuseUnmatchedWorkerSelector(args.targetLabel, () =>
      runtime.showManagedTerminalWorkspace(existingWorktree)
    )
    fastWorkerMode = await preflightWorkerAgentOnHost({
      runtime,
      mode,
      agent: launchParams.agent,
      resolvedWorktree: fastWorkspace
    })
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
  return { ...prepared, launchParams, fastWorkspace, fastWorkerMode }
}

export async function preflightWorkerLaunchPreferencesOnHost(
  {
    runtime,
    agent,
    mode,
    createsWorktree,
    creationTarget,
    resolvedWorktree
  }: {
    runtime: OrcaRuntimeService
    agent: TuiAgent | undefined
    mode: WorkerStartModeReceipt
    createsWorktree: boolean
    creationTarget?: WorkerWorktreeCreationTarget
    resolvedWorktree?: { id: string }
  },
  prepared: Awaited<ReturnType<typeof preflightLocalWorkerStartLaunch>>
): Promise<void> {
  const { launch, launchParams: params } = prepared
  if (
    agent &&
    (mode.mode === 'terminal' || createsWorktree) &&
    (params.role || params.fastMode !== undefined)
  ) {
    await runtime.preflightOrchestrationWorkerLaunch(
      agent,
      launch.preferences,
      createsWorktree
        ? { repo: creationTarget?.repoSelector ?? params.repo }
        : resolvedWorktree
          ? { worktree: `id:${resolvedWorktree.id}` }
          : {}
    )
  }
}

export function applyWorkerStartRole(runtime: OrcaRuntimeService, params: WorkerStartInput) {
  if (!params.role) {
    return params
  }
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
