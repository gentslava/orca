import type { AgentLaunchPreferences } from '../../../../../../../../shared/agent-session/lifecycle/operations/agent-session-host-authority'
import { checkAgentLaunchModelPreferences } from '../../../../../../../../shared/agent-launch/choices/agent-launch-model-preferences'
import {
  ORCHESTRATION_WORKER_LAUNCH_PREFERENCES_RUNTIME_CAPABILITY,
  ORCHESTRATION_WORKER_ROLE_ROUTING_RUNTIME_CAPABILITY
} from '../../../../../../../../shared/orchestration/orchestration-runtime-capabilities'
import type { TuiAgent } from '../../../../../../../../shared/agent-launch/catalog/tui-agent'
import { isTuiAgent } from '../../../../../../../../shared/agent-launch/catalog/tui-agent-config'
import { lazyZodSchema } from '../../../../../../../../shared/schema/lazy-zod-schema'
import { OrchestrationError } from '../../../../../../orchestration/orchestration-error'
import { z } from 'zod'

import {
  createPendingWorkerLaunchReceipt,
  createWorkerLaunchReceipt,
  type OrchestrationWorkerLaunchReceipt
} from './worker-launch-receipt'

export {
  createPendingWorkerLaunchReceipt,
  createWorkerLaunchReceipt,
  parseWorkerLaunchPreflight,
  resolveFederatedWorkerLaunchReceipt,
  reusedWorkerLaunchReceipt,
  structuredWorkerLaunchReceipt,
  type OrchestrationWorkerLaunchReceipt,
  type OrchestrationWorkerLaunchSelection
} from './worker-launch-receipt'

export function formatDroppedRetryLaunchWarning(
  dropped: { model?: string; effort?: string },
  reason: string
): string {
  const parts = [
    dropped.model ? `model ${dropped.model}` : undefined,
    dropped.effort ? `effort ${dropped.effort}` : undefined
  ].filter((part): part is string => Boolean(part))
  const detail = reason.replace(/\s+/g, ' ').trim()
  return `not carrying over ${parts.join(' / ')} from the retried worker: ${detail}`
}

export function joinWorkerStartWarnings(
  ...warnings: readonly (string | undefined)[]
): string | undefined {
  const present = warnings.filter((warning): warning is string => Boolean(warning))
  return present.length ? present.join(' ') : undefined
}

export function resolveWorkerLaunchPreferences(args: {
  agent: TuiAgent
  openCodeModelLaunchSupported?: boolean
  createsWorktree?: boolean
  model?: string
  effort?: string
  inheritedLaunchPreferences?: boolean
  fastMode?: boolean
  role?: string
  structuredFastModeSupported?: boolean
  structuredFastServiceTier?: string
}): {
  preferences: AgentLaunchPreferences | undefined
  receipt: OrchestrationWorkerLaunchReceipt
  warning?: string
} {
  const structuredFast =
    args.structuredFastModeSupported === true && (args.agent === 'claude' || args.agent === 'codex')
  if (
    structuredFast &&
    args.agent === 'codex' &&
    args.fastMode !== undefined &&
    !args.structuredFastServiceTier
  ) {
    throw new OrchestrationError(
      'capability_unsupported',
      'Codex Fast requires a verified service tier. No effects were applied.',
      { effectsApplied: false }
    )
  }
  const checked = checkAgentLaunchModelPreferences({
    ...args,
    fastMode: structuredFast ? undefined : args.fastMode
  })
  if ('refusal' in checked) {
    if (args.inheritedLaunchPreferences && (args.model || args.effort)) {
      const launch = resolveWorkerLaunchPreferences({
        ...args,
        model: undefined,
        effort: undefined,
        inheritedLaunchPreferences: false
      })
      return { ...launch, warning: formatDroppedRetryLaunchWarning(args, checked.refusal.message) }
    }
    throw new OrchestrationError(checked.refusal.code, checked.refusal.message)
  }
  const preferences =
    structuredFast && args.fastMode !== undefined
      ? {
          ...checked.preferences,
          ...(args.agent === 'codex'
            ? { serviceTier: args.structuredFastServiceTier }
            : { fastMode: args.fastMode })
        }
      : checked.preferences
  return {
    preferences,
    receipt: createWorkerLaunchReceipt({
      agent: args.agent,
      role: args.role,
      ...preferences,
      ...(args.fastMode !== undefined ? { fastMode: args.fastMode } : {})
    })
  }
}

export function assertWorkerLaunchPreferencesCreateTerminal(args: {
  terminal?: string
  model?: string
  effort?: string
  fastMode?: boolean
  role?: string
}): void {
  if (args.terminal && (args.role || args.model || args.effort || args.fastMode !== undefined)) {
    throw new OrchestrationError(
      'invalid_argument',
      '--role, --model, --effort, and --fast cannot be applied when reusing an existing terminal.'
    )
  }
}

export function assertWorkerLaunchPreferencesRuntimeSupported(args: {
  model?: string
  effort?: string
  fastMode?: boolean
  role?: string
  capabilities?: readonly string[]
  serverName: string
}): void {
  if (
    (args.role || args.fastMode !== undefined) &&
    !args.capabilities?.includes(ORCHESTRATION_WORKER_ROLE_ROUTING_RUNTIME_CAPABILITY)
  ) {
    throw new OrchestrationError(
      'capability_unsupported',
      `Connected server ${args.serverName} does not support worker roles or Fast launch options. No effects were applied.`,
      { effectsApplied: false }
    )
  }
  if (
    (args.model || args.effort) &&
    !args.capabilities?.includes(ORCHESTRATION_WORKER_LAUNCH_PREFERENCES_RUNTIME_CAPABILITY)
  ) {
    throw new OrchestrationError(
      'capability_unsupported',
      `Connected server ${args.serverName} does not support worker model or effort overrides.`
    )
  }
}

export function resolveFederatedWorkerLaunchPreferences(args: {
  params: {
    agent?: string
    model?: string
    effort?: string
    inheritedLaunchPreferences?: boolean
  }
  createsWorktree: boolean
  capabilities?: readonly string[]
  serverName: string
}): {
  model: string | undefined
  effort: string | undefined
  requestedLaunch: OrchestrationWorkerLaunchReceipt
  warning?: string
} {
  const { params, createsWorktree, capabilities, serverName } = args
  let { model, effort } = params
  let warning: string | undefined
  const tuiAgent = isTuiAgent(params.agent) ? params.agent : null
  if ((model || effort) && tuiAgent && (tuiAgent !== 'opencode' || createsWorktree)) {
    const checked = checkAgentLaunchModelPreferences({
      agent: tuiAgent,
      createsWorktree,
      model,
      effort
    })
    if ('refusal' in checked) {
      if (!params.inheritedLaunchPreferences) {
        throw new OrchestrationError(checked.refusal.code, checked.refusal.message)
      }
      warning = formatDroppedRetryLaunchWarning({ model, effort }, checked.refusal.message)
      model = undefined
      effort = undefined
    }
  }
  if (
    (model || effort) &&
    !capabilities?.includes(ORCHESTRATION_WORKER_LAUNCH_PREFERENCES_RUNTIME_CAPABILITY)
  ) {
    if (!params.inheritedLaunchPreferences) {
      assertWorkerLaunchPreferencesRuntimeSupported({ model, effort, capabilities, serverName })
    }
    warning = formatDroppedRetryLaunchWarning(
      { model, effort },
      `Connected server ${serverName} does not support worker model or effort overrides.`
    )
    model = undefined
    effort = undefined
  }
  return {
    model,
    effort,
    requestedLaunch: createPendingWorkerLaunchReceipt({ agent: tuiAgent, model, effort }),
    ...(warning ? { warning } : {})
  }
}

const RecordedStartOptions = lazyZodSchema(() =>
  z.looseObject({
    agent: z.string().nullish(),
    launch: z
      .looseObject({
        requested: z
          .looseObject({
            agent: z.string().nullish(),
            model: z.string().nullish(),
            effort: z.string().nullish()
          })
          .nullish()
      })
      .nullish()
  })
)

export type RecordedWorkerLaunchOptions = {
  agent?: string
  requestedAgent?: string
  model?: string
  effort?: string
}

function nonEmptyOption(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function parseRecordedWorkerLaunchOptions(raw: string): RecordedWorkerLaunchOptions {
  let decoded: unknown
  try {
    decoded = JSON.parse(raw)
  } catch {
    return {}
  }
  const parsed = RecordedStartOptions.safeParse(decoded)
  if (!parsed.success) {
    return {}
  }
  const requested = parsed.data.launch?.requested
  const requestedAgent = nonEmptyOption(requested?.agent)
  return {
    agent: nonEmptyOption(parsed.data.agent) ?? requestedAgent,
    requestedAgent,
    model: nonEmptyOption(requested?.model),
    effort: nonEmptyOption(requested?.effort)
  }
}
