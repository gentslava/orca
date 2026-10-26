import { agentJournalToolCallLifecycle } from './agent-journal-tool-call-lifecycle'
import { pairToolBlocks, type NativeChatToolPair } from './native-chat/tools/native-chat-tool-pairs'
import type { NativeChatBlock } from './native-chat-types'

/** Interrupted calls remain neutral even when an older provider marked their result as an error. */
export function nativeChatToolFailures(blocks: readonly NativeChatBlock[]): NativeChatToolPair[] {
  if (
    !blocks.some((block) =>
      block.type === 'tool-call'
        ? agentJournalToolCallLifecycle(block) === 'failed'
        : block.type === 'tool-result' && block.isError === true
    )
  ) {
    return []
  }
  return pairToolBlocks(blocks).filter(({ call, result }) => {
    const lifecycle = call ? agentJournalToolCallLifecycle(call) : undefined
    return lifecycle === 'failed' || (lifecycle !== 'interrupted' && result?.isError === true)
  })
}
