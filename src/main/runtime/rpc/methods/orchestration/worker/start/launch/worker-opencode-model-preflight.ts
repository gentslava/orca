import {
  prepareFederationConfiguredWorkerStart,
  resolveWorkerConfiguredAgentParams
} from './worker-configured-agent-preflight'
import { formatDroppedRetryLaunchWarning } from './worker-launch-preferences'
import type { prepareFederationAttachmentWorkerStart } from './worker-start-validation'
import {
  refuseUnmatchedWorkerSelector,
  type WorkerStartSelectorLabel
} from '../worker-start-selector-refusal'
import type { WorkerStartInput } from '../worker-start-input'
import type { OrcaRuntimeService } from '../../../../../../orca-runtime'
import { OrchestrationError } from '../../../../../../orchestration/orchestration-error'

export async function probeWorkerOpenCodeModelLaunchSupport(
  runtime: OrcaRuntimeService,
  params: { agent?: string; model?: string },
  target: { worktree?: string }
): Promise<boolean> {
  return Boolean(
    params.model &&
    params.agent &&
    runtime.resolveOrchestrationAgentLauncher(params.agent) === 'opencode' &&
    (await runtime.probeOrchestrationOpenCodeModelLaunchSupport({ ...target, model: params.model }))
  )
}

export async function resolveLocalWorkerStartPreferences(args: {
  params: WorkerStartInput
  createsWorktree: boolean
  existingWorktree: string
  targetLabel: WorkerStartSelectorLabel
  runtime: OrcaRuntimeService
  resolveTarget: () => Promise<{ repo?: string; worktree?: string }>
}) {
  const { createsWorktree, existingWorktree, targetLabel, runtime, resolveTarget } = args
  const launchParams = await refuseUnmatchedWorkerSelector(targetLabel, () =>
    resolveWorkerConfiguredAgentParams(runtime, args.params, resolveTarget)
  )
  let openCodeModelLaunchSupported = false
  let probeDropWarning: string | undefined
  if (!createsWorktree && launchParams.agent === 'opencode' && launchParams.model) {
    try {
      openCodeModelLaunchSupported = await refuseUnmatchedWorkerSelector(targetLabel, () =>
        probeWorkerOpenCodeModelLaunchSupport(runtime, launchParams, { worktree: existingWorktree })
      )
    } catch (error) {
      if (
        launchParams.inheritedLaunchPreferences &&
        error instanceof OrchestrationError &&
        error.code === 'capability_unsupported'
      ) {
        probeDropWarning = formatDroppedRetryLaunchWarning(launchParams, error.message)
      } else {
        throw error
      }
    }
  }
  return {
    launchParams: probeDropWarning
      ? { ...launchParams, model: undefined, effort: undefined, inheritedLaunchPreferences: false }
      : launchParams,
    openCodeModelLaunchSupported,
    probeDropWarning
  }
}

export async function prepareFederationWorkerLaunchOnHost(
  args: Omit<
    Parameters<typeof prepareFederationAttachmentWorkerStart>[0],
    'openCodeModelLaunchSupported'
  >
) {
  const params = await resolveWorkerConfiguredAgentParams(args.runtime, args.params, async () =>
    args.createsWorktree ? { repo: args.params.repo } : { worktree: args.params.worktree }
  )
  const openCodeModelLaunchSupported =
    !args.createsWorktree &&
    (await probeWorkerOpenCodeModelLaunchSupport(args.runtime, params, {
      worktree: params.worktree
    }))
  const prepared = await prepareFederationConfiguredWorkerStart({
    ...args,
    params,
    openCodeModelLaunchSupported
  })
  if (prepared.agent && (params.role || params.fastMode !== undefined)) {
    await args.runtime.preflightOrchestrationWorkerLaunch(
      prepared.agent,
      prepared.launch.preferences,
      args.createsWorktree ? { repo: params.repo } : { worktree: params.worktree }
    )
  }
  return prepared
}
