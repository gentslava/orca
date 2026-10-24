import type {
  AgentSessionMutationEnvelope,
  AgentSessionMutationResult,
  AgentSessionQueuedMessageMoveResult
} from '../../../shared/agent-session-wire'
import type { StructuredAgentSessionCaller } from './structured-agent-session-host-types'
import type { StructuredAgentSessionMutationContext } from './structured-agent-session-mutation-context'
import type { MutationPlan } from './structured-agent-session-mutation-plans'
import { mutateQueued } from './structured-agent-session-queued-mutations'

export function moveQueuedStructuredAgentMessage(
  context: StructuredAgentSessionMutationContext,
  caller: StructuredAgentSessionCaller,
  params: {
    envelope: AgentSessionMutationEnvelope
    messageId: string
    beforeMessageId: string | null
  }
): Promise<AgentSessionMutationResult<AgentSessionQueuedMessageMoveResult>> {
  const { envelope, ...fields } = params
  const plan: MutationPlan<AgentSessionQueuedMessageMoveResult> = {
    method: 'agentSession.queuedMessageMove',
    fields,
    conversationWrite: true,
    commandReceipt: {
      result: () => ({ kind: 'queued-draft', messageId: fields.messageId }),
      unwritten: () => ({ kind: 'no-op', outcome: { kind: 'queue-move', moved: false } })
    },
    run: async (ctx) => ({
      ok: true,
      value: { moved: await ctx.journal.queuedMessages.move(fields, ctx.operationReceipt) }
    }),
    replay: (_ctx, _outcome, receipt) =>
      receipt?.kind === 'queued-draft'
        ? { moved: true }
        : receipt?.kind === 'no-op' && receipt.outcome.kind === 'queue-move'
          ? { moved: false }
          : null
  }
  return mutateQueued(context, caller, envelope, plan)
}
