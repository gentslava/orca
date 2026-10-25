import type { StructuredAgentSessionMutationContext } from './structured-agent-session-mutation-context'
import type { AgentSessionTurnContext } from './structured-agent-session-turns'
import { contextStructuredAgentSessionCurrentWork } from './structured-agent-session-current-work'
import { structuredAgentSessionSendBlock } from './structured-agent-session-send-preparation'

/** Caller holds session serialization; saved intent survives unavailable or failed metadata writes. */
export async function confirmIdleStructuredAgentSessionOption(
  context: StructuredAgentSessionMutationContext,
  ctx: AgentSessionTurnContext,
  input: { key: string; value: string }
): Promise<void> {
  const { sessionId, fence } = ctx
  const { adapter, store } = context.deps
  const child = context.sessions.get(sessionId)?.child
  const record = store.getRecord(sessionId)
  const write = { sessionId, fence, ...input }
  if (
    !child ||
    child.phase !== 'ready' ||
    child.close ||
    child.fence !== fence ||
    record?.lease.claimStatus !== 'live' ||
    record.lease.runtimeFence !== fence ||
    record.options?.[input.key] !== input.value ||
    structuredAgentSessionSendBlock(record) ||
    adapter.canSetOptionWhileIdle?.(write) !== true
  ) {
    return
  }
  const work = contextStructuredAgentSessionCurrentWork(ctx)
  if (
    work.working() ||
    work.hasActionablePrompt() ||
    context.childWorkOpen(sessionId) ||
    ctx.journal.queuedMessages.awaitReopenMark()
  ) {
    return
  }
  const operation = context.acquireAborts.begin(sessionId)
  try {
    await adapter.setOption({ ...write, signal: operation.signal })
  } catch (error) {
    ctx.logger.warn('confirming idle session metadata failed', {
      scope: 'idle-option',
      sessionId,
      error
    })
  } finally {
    operation.end()
    ctx.publish()
  }
}
