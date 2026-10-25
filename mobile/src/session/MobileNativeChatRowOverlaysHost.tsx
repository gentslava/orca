import { useEffect, useMemo } from 'react'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import { MobileNativeChatImageViewer } from './MobileNativeChatImageViewer'
import { MobileNativeChatMessageActionsSheet } from './MobileNativeChatMessageActionsSheet'
import {
  MobileNativeChatRowOverlaysContext,
  type MobileNativeChatViewedImage
} from './mobile-native-chat-row-overlays'
import {
  useMobileNativeChatConversationState,
  type MobileNativeChatConversation
} from './use-mobile-native-chat-conversation-state'
import type { MobileNativeChatVisualSource } from './mobile-native-chat-visual-read'
import type { RpcClient } from '../transport/rpc-client'

export function MobileNativeChatRowOverlaysHost({
  conversation,
  imageSource,
  children
}: {
  conversation: MobileNativeChatConversation
  imageSource?: MobileNativeChatVisualSource | null
  children?: React.ReactNode
}): React.JSX.Element {
  // Keep pressed message text with its conversation so streaming cannot rewrite an open sheet.
  const [shown, setShown] = useMobileNativeChatConversationState<{
    image?: MobileNativeChatViewedImage
    imageOwner?: { client: RpcClient; generation: number }
    actionsFor?: NativeChatMessage
  }>(conversation)
  const client = imageSource?.client
  const generation = client?.getGeneration?.() ?? 0
  const ownsImage =
    !shown?.imageOwner ||
    (shown.imageOwner.client === client && shown.imageOwner.generation === generation)
  useEffect(() => {
    if (!ownsImage) {
      setShown(null)
    }
  }, [ownsImage, setShown])
  const overlays = useMemo(
    () => ({
      imageSource,
      openImage: (image: MobileNativeChatViewedImage) =>
        setShown({
          image,
          ...(client ? { imageOwner: { client, generation } } : {})
        }),
      openActions: (actionsFor: NativeChatMessage) => setShown({ actionsFor })
    }),
    [imageSource, client, generation, setShown]
  )
  // Memoize overlay callbacks so streamed words cannot rebuild them.
  const opened = useMemo(() => {
    const close = () => setShown(null)
    return shown?.image && ownsImage ? (
      <MobileNativeChatImageViewer {...shown.image} onClose={close} />
    ) : shown?.actionsFor ? (
      <MobileNativeChatMessageActionsSheet message={shown.actionsFor} onClose={close} />
    ) : null
  }, [shown, ownsImage, setShown])
  return (
    <MobileNativeChatRowOverlaysContext.Provider value={overlays}>
      {children}
      {opened}
    </MobileNativeChatRowOverlaysContext.Provider>
  )
}
