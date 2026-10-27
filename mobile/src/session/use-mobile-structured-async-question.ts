import { useCallback, useMemo } from 'react'
import { extractPendingMessageReplyAsk } from '../../../src/shared/native-chat/input/native-chat-ask'
import {
  formatAskAnswer,
  type AskAnswerSelection
} from '../../../src/shared/native-chat-ask-answer'
import type { AskPrompt } from '../../../src/shared/native-chat/input/native-chat-ask-types'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { useMobileStructuredAgentSession } from './use-mobile-structured-agent-session'

export type MobileStructuredAskSession = Pick<
  ReturnType<typeof useMobileStructuredAgentSession>,
  'permission' | 'question' | 'sendWithOutcome'
>

// Card answers reach the current turn without touching the composer draft.
export function useMobileStructuredAsyncQuestion(args: {
  structured: MobileStructuredAskSession | null
  messages: readonly NativeChatMessage[]
  transcriptLoading: boolean
}): {
  ask: AskPrompt | null
  answer: ((prompt: AskPrompt, selections: AskAnswerSelection[]) => Promise<boolean>) | null
} {
  const { structured, messages, transcriptLoading } = args
  // A journal prompt takes the card slot first, as on desktop.
  const readable =
    structured !== null && !structured.permission && !structured.question && !transcriptLoading
  const ask = useMemo(
    () => (readable ? extractPendingMessageReplyAsk(messages) : null),
    [readable, messages]
  )
  const sendWithOutcome = structured?.sendWithOutcome
  const answer = useCallback(
    async (prompt: AskPrompt, selections: AskAnswerSelection[]) =>
      sendWithOutcome !== undefined &&
      (await sendWithOutcome(formatAskAnswer(prompt, selections), undefined, undefined, undefined, {
        delivery: 'immediate'
      })) !== 'rejected',
    [sendWithOutcome]
  )
  return { ask, answer: structured ? answer : null }
}
