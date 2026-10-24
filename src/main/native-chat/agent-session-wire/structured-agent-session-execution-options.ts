import {
  readAgentSessionExecutionOptions,
  type AgentSessionExecutionOptions
} from '../../../shared/agent-session-execution-options'
import { refuse, type AgentSessionWireRefusal } from '../../../shared/agent-session-wire'
import type { AgentSessionTurnContext } from './structured-agent-session-turns'
import { structuredAgentSessionOptionOverridesRefusal } from './structured-agent-session-options-read'
import { agentJournalSubmissionKey } from '../../../shared/agent-session-journal-item-key'
import { contextStructuredAgentSessionCurrentWork } from './structured-agent-session-current-work'

/** Capture send-specific choices or saved defaults once under the acceptance lane. */
export function captureStructuredExecutionOptions(
  ctx: Pick<AgentSessionTurnContext, 'agents' | 'agent' | 'persistedOptions'>,
  supplied?: Readonly<Record<string, string>>
): { options: AgentSessionExecutionOptions } | { refusal: AgentSessionWireRefusal } {
  const saved = ctx.persistedOptions ?? {}
  const candidate = {
    ...(saved.model ? { model: saved.model } : {}),
    ...(saved.effort ? { effort: saved.effort } : {}),
    ...(saved.personality ? { personality: saved.personality } : {}),
    ...(saved.fastMode ? { fastMode: saved.fastMode } : {}),
    ...(saved.serviceTier ? { serviceTier: saved.serviceTier } : {}),
    ...supplied
  }
  const options = readAgentSessionExecutionOptions(candidate)
  if (!options) {
    return {
      refusal: refuse(
        'agent_session_operation_invalid',
        { reason: 'optionRejected' },
        'This message has an invalid choice.'
      )
    }
  }
  const refusal = structuredAgentSessionOptionOverridesRefusal(
    ctx.agents,
    ctx.agent,
    Object.fromEntries(
      Object.entries(options).filter(([key]) => !(ctx.agent === 'codex' && key === 'fastMode'))
    )
  )
  return refusal ? { refusal } : { options }
}

/** Steering reuses acceptance facts, never the next-message picker or a later provider report. */
export function captureStructuredSteerOptions(
  ctx: AgentSessionTurnContext,
  supplied?: Readonly<Record<string, string>>
): ReturnType<typeof captureStructuredExecutionOptions> {
  const turn = ctx.journal.newestTurn()
  const work = contextStructuredAgentSessionCurrentWork(ctx)
  if (!work.working()) {
    return captureStructuredExecutionOptions(ctx, supplied)
  }
  const candidates = ctx.journal
    .submissions()
    .filter(
      (submission) =>
        submission.handedOverAt !== undefined &&
        (turn?.state === 'running' && work.activeTurnId() !== null
          ? agentJournalSubmissionKey(submission.clientMessageId) === turn.userItemId
          : work.owesSend(submission))
    )
  const active = candidates.length === 1 ? candidates[0] : undefined
  return active?.options
    ? { options: { ...active.options } }
    : {
        refusal: refuse(
          'agent_session_operation_invalid',
          { reason: 'turnActive' },
          "The running turn's choices are unavailable. Queue this draft or send it after the turn finishes."
        )
      }
}
