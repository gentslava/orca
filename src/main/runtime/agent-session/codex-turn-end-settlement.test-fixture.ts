import { classifyDispatchRejection } from '../../../shared/agent-session/requests/structured-agent-session-dispatch-rejection'
import type { AgentJournalSubmission } from '../../../shared/agent-session/journal/agent-session-journal-types'

export function verdictOf(submissions: readonly AgentJournalSubmission[], clientMessageId: string) {
  const submission = submissions.find((entry) => entry.clientMessageId === clientMessageId)
  return submission?.dispatchState === 'rejected'
    ? classifyDispatchRejection(submission).category
    : submission?.dispatchState
}

let operations = 0

/** The durable ledger stamps its own clock and refuses an id far from it. */
export const operationId = (): string =>
  `${Date.now()}-${(++operations).toString(16).padStart(32, '0')}`
