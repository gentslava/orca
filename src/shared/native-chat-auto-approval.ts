import type { NativeChatMessage, NativeChatTextBlock } from './native-chat-types'

export type NativeChatAutoApprovalOutcome =
  | 'approved'
  | 'rejected'
  | 'denied'
  | 'timed-out'
  | 'safety-denied'

export function nativeChatAutoApprovalOutcome(
  block: NativeChatTextBlock
): NativeChatAutoApprovalOutcome | null {
  if (
    block.presentation !== undefined ||
    block.failure !== undefined ||
    block.orcaStop !== undefined ||
    block.usageLimitTurnItemId !== undefined
  ) {
    return null
  }
  const frame = block.providerFrame
  if (
    block.tone === 'error' &&
    frame?.provider === 'claude' &&
    frame.kind === 'message:system:permission_denied' &&
    /^Permission for this command was denied by a built-in Claude Code safety check, not by the user\. \S[\s\S]*The command was NOT run;[\s\S]*What was flagged: \S/.test(
      block.text
    )
  ) {
    return 'safety-denied'
  }
  if (
    block.tone !== 'warning' ||
    frame?.provider !== 'codex' ||
    (frame.kind !== 'notification:warning' && frame.kind !== 'notification:guardianWarning')
  ) {
    return null
  }
  if (/^Automatic approval review approved \([^\n)]+\):\s+\S/.test(block.text)) {
    return 'approved'
  }
  if (
    /^Automatic approval review rejected(?: \([^\n)]+\))?:\s+\S/.test(block.text) ||
    /^Automatic approval review rejected too many approval requests for this turn \(\d+ consecutive, \d+ in the last \d+ reviews\); interrupting the turn\.$/.test(
      block.text
    )
  ) {
    return 'rejected'
  }
  if (/^Automatic approval review denied(?: \([^\n)]+\))?:\s+\S/.test(block.text)) {
    return 'denied'
  }
  if (
    /^Automatic approval review (?:failed: Automatic approval review )?timed out(?:\.| while evaluating the requested approval\.)(?:\s|$)/.test(
      block.text
    )
  ) {
    return 'timed-out'
  }
  return null
}

/** Only successful reviews may join routine work activity. */
export function isNativeChatAutoApprovalNotice(block: NativeChatTextBlock): boolean {
  return nativeChatAutoApprovalOutcome(block) === 'approved'
}

export function isNativeChatAutoApprovalMessage(message: NativeChatMessage): boolean {
  return (
    message.role === 'system' &&
    message.blocks.length > 0 &&
    message.blocks.every((block) => block.type === 'text' && isNativeChatAutoApprovalNotice(block))
  )
}
