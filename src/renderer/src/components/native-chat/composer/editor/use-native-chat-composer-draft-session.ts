import { useState } from 'react'
import { useNativeChatDraft } from '../../drafts/use-native-chat-draft'
import { useNativeChatLaunchDraftAdoption } from '../../drafts/use-native-chat-launch-draft-adoption'

export function useNativeChatComposerDraftSession(
  scope: string,
  isComposing: Parameters<typeof useNativeChatDraft>[1],
  launch: Pick<
    Parameters<typeof useNativeChatLaunchDraftAdoption>[0],
    'terminalTabId' | 'agent' | 'launchSeed'
  >
) {
  const draftState = useNativeChatDraft(scope, isComposing)
  const { draft, setDraft } = draftState
  const [caret, setCaret] = useState(draft.length)
  useNativeChatLaunchDraftAdoption({ ...launch, draft, setDraft, setCaret })
  return { draftState, caret, setCaret }
}
