import { useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { ensureLocalRuntimeCapabilities } from '@/runtime/local-runtime-capabilities'
import {
  CONVERSATION_NAVIGATION_CAPABILITY,
  normalizeConversationPreferences,
  type ConversationPreference,
  type ConversationPreferences
} from '../../../../shared/conversation-navigation-preferences'

let current: ConversationPreferences = { revision: 0, entries: {} }
let supported = false
const listeners = new Set<() => void>()
let flight: Promise<void> | null = null
function accept(next: unknown): void {
  const parsed = normalizeConversationPreferences(next)
  if (parsed.revision < current.revision) {
    return
  }
  current = parsed
  for (const listener of listeners) {
    listener()
  }
}
function refresh(): Promise<void> {
  flight ??= (async () => {
    supported =
      (await ensureLocalRuntimeCapabilities())?.includes(CONVERSATION_NAVIGATION_CAPABILITY) ===
      true
    if (!supported) {
      return
    }
    const reply = await callRuntimeRpc<{
      ui: { conversationPreferences?: ConversationPreferences }
    }>({ kind: 'local' }, 'ui.get', {})
    accept(reply.ui.conversationPreferences)
  })()
    .catch(() => undefined)
    .finally(() => {
      flight = null
    })
  return flight
}
export function useConversationPreferences() {
  const preferences = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => current
  )
  useEffect(() => {
    void refresh()
    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])
  const setPreference = async (key: string, patch: ConversationPreference): Promise<void> => {
    try {
      await refresh()
      if (!supported) {
        throw new Error('host-update-required')
      }
      const reply = await callRuntimeRpc<{ preferences: ConversationPreferences }>(
        { kind: 'local' },
        'ui.setConversationPreference',
        { key, ...patch }
      )
      accept(reply.preferences)
    } catch {
      toast.error(
        translate(
          'projectConversations.saveFailed',
          'Could not save chat preferences. Update Orca or try again.'
        )
      )
    }
  }
  return { preferences, setPreference }
}
