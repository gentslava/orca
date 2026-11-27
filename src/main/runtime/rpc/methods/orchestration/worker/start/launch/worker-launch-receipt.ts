import { z } from 'zod'
import { lazyZodSchema } from '../../../../../../../../shared/schema/lazy-zod-schema'
import type { TuiAgent } from '../../../../../../../../shared/agent-launch/catalog/tui-agent'
import { isTuiAgent } from '../../../../../../../../shared/agent-launch/catalog/tui-agent-config'
import type { AgentMessageSender } from '../../../../../../../../shared/agent-session/journal/agent-session-message-source'
import type { OrcaRuntimeService } from '../../../../../../orca-runtime'
import { OrchestrationError } from '../../../../../../orchestration/orchestration-error'

export type OrchestrationWorkerLaunchSelection = {
  agent: TuiAgent | null
  model: string | null
  effort: string | null
  fastMode?: boolean
  serviceTier?: string
}

export type OrchestrationWorkerLaunchReceipt = {
  role?: string
  effectiveSource?: 'launch_configuration'
  requested: OrchestrationWorkerLaunchSelection
  effective: OrchestrationWorkerLaunchSelection | null
}

const PreflightSelection = lazyZodSchema(() =>
  z.object({
    agent: z.custom<TuiAgent>((value) => typeof value === 'string' && isTuiAgent(value)),
    model: z.string().nullable(),
    effort: z.string().nullable(),
    fastMode: z.boolean().optional(),
    serviceTier: z.string().optional()
  })
)

export function parseWorkerLaunchPreflight(value: unknown): OrchestrationWorkerLaunchReceipt {
  const parsed = z
    .object({
      launch: z.object({
        role: z.string().optional(),
        requested: PreflightSelection,
        effective: z.null()
      })
    })
    .safeParse(value)
  if (!parsed.success) {
    throw new OrchestrationError(
      'capability_unsupported',
      'The execution host returned an invalid launch preflight receipt. No effects were applied.',
      { effectsApplied: false }
    )
  }
  return parsed.data.launch
}

export function createWorkerLaunchReceipt(args: {
  agent: TuiAgent | null
  model?: string
  effort?: string
  fastMode?: boolean
  serviceTier?: string
  role?: string
}): OrchestrationWorkerLaunchReceipt {
  const selection = {
    agent: args.agent,
    model: args.model ?? null,
    effort: args.effort ?? null,
    ...(args.fastMode !== undefined ? { fastMode: args.fastMode } : {}),
    ...(args.serviceTier !== undefined ? { serviceTier: args.serviceTier } : {})
  }
  return {
    ...(args.role ? { role: args.role } : {}),
    ...(args.role || args.fastMode !== undefined
      ? { effectiveSource: 'launch_configuration' as const }
      : {}),
    requested: selection,
    effective: { ...selection }
  }
}

/** A chat worker launches with the model and effort its session was seeded with, not only those the caller asked for. */
export function structuredWorkerLaunchReceipt(
  receipt: OrchestrationWorkerLaunchReceipt,
  options: Readonly<Record<string, string>> | undefined
): OrchestrationWorkerLaunchReceipt {
  return {
    ...receipt,
    effective: {
      ...(receipt.effective ?? receipt.requested),
      model: options?.model ?? null,
      effort: options?.effort ?? null
    }
  }
}

/** A reuse start launches nothing; the agent already running there is its effective agent, so
 *  mail from a start that never binds still names it. */
export function reusedWorkerLaunchReceipt(
  runtime: Pick<OrcaRuntimeService, 'orchestrationSenderNames'>,
  receipt: OrchestrationWorkerLaunchReceipt,
  party: AgentMessageSender['party']
): OrchestrationWorkerLaunchReceipt {
  if (receipt.effective?.agent) {
    return receipt
  }
  const running = runtime.orchestrationSenderNames.liveAgentOf(party)
  return isTuiAgent(running)
    ? {
        ...receipt,
        effective: { ...(receipt.effective ?? receipt.requested), agent: running }
      }
    : receipt
}

export function createPendingWorkerLaunchReceipt(args: {
  agent: TuiAgent | null
  model?: string
  effort?: string
  fastMode?: boolean
  role?: string
}): OrchestrationWorkerLaunchReceipt {
  return {
    ...(args.role ? { role: args.role } : {}),
    requested: {
      agent: args.agent,
      model: args.model ?? null,
      effort: args.effort ?? null,
      ...(args.fastMode !== undefined ? { fastMode: args.fastMode } : {})
    },
    effective: null
  }
}

export function resolveFederatedWorkerLaunchReceipt(
  remote: OrchestrationWorkerLaunchReceipt | undefined,
  requested: OrchestrationWorkerLaunchReceipt,
  remoteReady: boolean
): OrchestrationWorkerLaunchReceipt {
  if (requested.role || requested.requested.fastMode !== undefined) {
    if (!remote || remote.role !== requested.role || (remoteReady && !remote.effective)) {
      throw new Error(
        'The worker server did not return a verifiable role launch receipt; do not retry the Task.'
      )
    }
    const actual = remoteReady ? remote.effective : remote.requested
    if (
      !actual ||
      actual.agent !== requested.requested.agent ||
      actual.model !== requested.requested.model ||
      actual.effort !== requested.requested.effort ||
      actual.fastMode !== requested.requested.fastMode ||
      actual.serviceTier !== requested.requested.serviceTier
    ) {
      throw new Error(
        'The worker server returned different effective launch options; inspect the existing Dispatch before taking further action.'
      )
    }
  }
  if (remote) {
    return remote
  }
  return remoteReady
    ? { requested: requested.requested, effective: { ...requested.requested } }
    : requested
}
