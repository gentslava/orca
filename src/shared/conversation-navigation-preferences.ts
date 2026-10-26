import { z } from 'zod'
import type { AiVaultSession } from './ai-vault-types'

export const CONVERSATION_NAVIGATION_CAPABILITY = 'ui.conversationPreferences.v1'
const Preference = z.object({ pinned: z.boolean().optional(), archived: z.boolean().optional() })
export const ConversationPreferencesSchema = z.object({
  revision: z.number().int().nonnegative().catch(0),
  entries: z.record(z.string().max(2048), Preference.catch({})).catch({})
})
export type ConversationPreferences = z.infer<typeof ConversationPreferencesSchema>
export type ConversationPreference = z.infer<typeof Preference>
export const SetConversationPreferenceParams = z
  .object({
    key: z.string().min(1).max(2048),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional()
  })
  .strict()
  .refine((value) => value.pinned !== undefined || value.archived !== undefined)

export function normalizeConversationPreferences(value: unknown): ConversationPreferences {
  const result = ConversationPreferencesSchema.safeParse(value)
  return result.success ? result.data : { revision: 0, entries: {} }
}

export function conversationPreferenceKey(
  session: Pick<AiVaultSession, 'executionHostId' | 'structuredSession' | 'sessionId'> & {
    agent: string
  }
): string {
  return JSON.stringify([
    session.executionHostId,
    session.structuredSession ? 'structured' : session.agent,
    session.structuredSession?.sessionId ?? session.sessionId
  ])
}

export function updateConversationPreference(
  current: unknown,
  request: z.infer<typeof SetConversationPreferenceParams>
): ConversationPreferences {
  const state = normalizeConversationPreferences(current)
  const previous = state.entries[request.key] ?? {}
  return {
    revision: Math.min(Number.MAX_SAFE_INTEGER, state.revision + 1),
    entries: {
      ...state.entries,
      [request.key]: {
        ...previous,
        ...(request.pinned !== undefined ? { pinned: request.pinned } : {}),
        ...(request.archived !== undefined ? { archived: request.archived } : {})
      }
    }
  }
}
