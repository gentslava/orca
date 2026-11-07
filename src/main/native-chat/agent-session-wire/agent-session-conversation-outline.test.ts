import { expect, it } from 'vitest'
import { readAgentSessionConversationOutline } from './publication/history/agent-session-conversation-outline'

it('marks even an empty successful outline as human-only', () => {
  expect(readAgentSessionConversationOutline({
    sessionId: 'session-1',
    cursor: { epoch: 'epoch-1', sequence: 0 },
    items: [],
    submissions: []
  })).toEqual({
    sessionId: 'session-1',
    humanMessagesOnly: true,
    cursor: { epoch: 'epoch-1', sequence: 0 },
    entries: [],
    omittedEntries: 0
  })
})
