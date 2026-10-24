import type { NativeChatMessage, NativeChatTextBlock } from './native-chat-types'

/** Only a completed provider review, never a request or an unknown guardian warning. */
export function isNativeChatAutoApprovalNotice(block: NativeChatTextBlock): boolean {
  return (
    block.tone === 'warning' &&
    block.presentation === undefined &&
    block.failure === undefined &&
    block.orcaStop === undefined &&
    block.usageLimitTurnItemId === undefined &&
    block.providerFrame?.provider === 'codex' &&
    (block.providerFrame.kind === 'notification:warning' ||
      block.providerFrame.kind === 'notification:guardianWarning') &&
    /^Automatic approval review approved \([^\n)]+\):\s+\S/.test(block.text)
  )
}

export function isNativeChatAutoApprovalMessage(message: NativeChatMessage): boolean {
  return (
    message.role === 'system' &&
    message.blocks.length > 0 &&
    message.blocks.every((block) => block.type === 'text' && isNativeChatAutoApprovalNotice(block))
  )
}
