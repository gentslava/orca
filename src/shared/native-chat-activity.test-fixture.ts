import type { NativeChatMessage, NativeChatTextBlock } from './native-chat-types'

export const APPROVED_REVIEW =
  'Automatic approval review approved (risk: medium, authorization: high): The requested local check is allowed.'

export function approvalReviewBlock(text = APPROVED_REVIEW): NativeChatTextBlock {
  return {
    type: 'text',
    tone: 'warning',
    text,
    providerFrame: {
      provider: 'codex',
      kind: 'notification:guardianWarning',
      payload: {
        head: JSON.stringify({ message: text }),
        byteLength: text.length,
        digest: 'review-digest',
        truncated: false
      }
    }
  }
}

export function approvalReviewMessage(id: string, text = APPROVED_REVIEW): NativeChatMessage {
  return {
    id,
    role: 'system',
    blocks: [approvalReviewBlock(text)],
    timestamp: 1,
    source: 'transcript'
  }
}

export const BLOCKED_APPROVAL_CASES = [
  {
    text: 'Automatic approval review rejected (risk: high, authorization: low): The request is outside the approved scope.',
    label: 'Automatic approval rejected'
  },
  {
    text: 'Automatic approval review denied: The request is outside the approved scope.',
    label: 'Automatic approval denied'
  },
  { text: 'Automatic approval review timed out.', label: 'Automatic approval timed out' },
  {
    text: 'Automatic approval review failed: Automatic approval review timed out while evaluating the requested approval.',
    label: 'Automatic approval timed out'
  },
  {
    text: 'Automatic approval review rejected too many approval requests for this turn (3 consecutive, 3 in the last 3 reviews); interrupting the turn.',
    label: 'Automatic approval rejected'
  }
].map(({ text, label }) => ({ block: approvalReviewBlock(text), label }))

const CLAUDE_SAFETY_DENIAL_TEXT =
  'Permission for this command was denied by a built-in Claude Code safety check, not by the user. The check requires a person to approve this removal. The command was NOT run; do not claim it succeeded. What was flagged: Dangerous removal operation involving an unresolved target.'
const CLAUDE_SAFETY_DENIAL_PAYLOAD = JSON.stringify({
  type: 'system',
  subtype: 'permission_denied',
  decision_reason_type: 'safetyCheck',
  message: CLAUDE_SAFETY_DENIAL_TEXT
})

export const CLAUDE_SAFETY_DENIAL: NativeChatTextBlock = {
  type: 'text',
  text: CLAUDE_SAFETY_DENIAL_TEXT,
  tone: 'error',
  providerFrame: {
    provider: 'claude',
    kind: 'message:system:permission_denied',
    payload: {
      head: CLAUDE_SAFETY_DENIAL_PAYLOAD,
      byteLength: CLAUDE_SAFETY_DENIAL_PAYLOAD.length,
      digest: 'safety-denial-digest',
      truncated: false
    }
  }
}

export const COMPACT_APPROVAL_CASES = [
  ...BLOCKED_APPROVAL_CASES,
  { block: CLAUDE_SAFETY_DENIAL, label: 'Permission denied by safety check' }
]

export const NON_COMPACT_APPROVAL_BLOCKS: NativeChatTextBlock[] = [
  approvalReviewBlock('Runtime error: disk is full.'),
  approvalReviewBlock('Automatic approval review failed: reviewer unavailable.'),
  approvalReviewBlock('Automatic approval review rejected (risk: high):'),
  approvalReviewBlock('Automatic approval review approved (risk: low):'),
  approvalReviewBlock('A warning mentions Automatic approval review denied: outside scope.'),
  approvalReviewBlock('"Automatic approval review denied: outside scope."'),
  approvalReviewBlock('Approval required to run this command.'),
  { ...CLAUDE_SAFETY_DENIAL, text: `"${CLAUDE_SAFETY_DENIAL.text}"` },
  {
    ...CLAUDE_SAFETY_DENIAL,
    text: 'Permission for this command was denied by a built-in Claude Code safety check, not by the user.'
  },
  {
    ...CLAUDE_SAFETY_DENIAL,
    providerFrame: { ...CLAUDE_SAFETY_DENIAL.providerFrame!, kind: 'message:system:mirror_error' }
  },
  { ...CLAUDE_SAFETY_DENIAL, providerFrame: undefined },
  { ...BLOCKED_APPROVAL_CASES[0]!.block, failure: { kind: 'notSignedIn' } }
]
