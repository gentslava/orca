import { describe, expect, it } from 'vitest'
import {
  conversationPreferenceKey,
  normalizeConversationPreferences,
  updateConversationPreference
} from './conversation-navigation-preferences'

describe('conversation navigation preferences', () => {
  it('keeps host identities and provider transcripts separate while native handles share one identity', () => {
    const row = {
      executionHostId: 'local' as const,
      agent: 'claude' as const,
      sessionId: 'provider-old',
      structuredSession: { sessionId: 'chat', workspaceId: 'folder:notes' }
    }
    expect(conversationPreferenceKey(row)).toBe(
      conversationPreferenceKey({ ...row, sessionId: 'provider-new' })
    )
    expect(conversationPreferenceKey(row)).not.toBe(
      conversationPreferenceKey({ ...row, executionHostId: 'runtime:remote' })
    )
    expect(conversationPreferenceKey(row)).not.toBe(
      conversationPreferenceKey({ ...row, structuredSession: undefined })
    )
  })
  it('merges independent pin/archive writes and restores an archived pinned conversation', () => {
    const pin = updateConversationPreference(null, { key: 'a', pinned: true })
    const archive = updateConversationPreference(pin, { key: 'a', archived: true })
    const other = updateConversationPreference(archive, { key: 'b', pinned: true })
    const restored = updateConversationPreference(other, { key: 'a', archived: false })
    expect(restored).toEqual({
      revision: 4,
      entries: { a: { pinned: true, archived: false }, b: { pinned: true } }
    })
  })
  it('tolerates absent and malformed older persisted state', () => {
    expect(normalizeConversationPreferences(null)).toEqual({ revision: 0, entries: {} })
    expect(normalizeConversationPreferences({ revision: 3, entries: { a: 'bad' } })).toEqual({
      revision: 3,
      entries: { a: {} }
    })
  })
})
