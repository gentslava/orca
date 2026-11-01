import type { ReactElement, Ref } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native'
import type { MobileNativeChatRowKeys } from './native-chat/transcript/mobile-native-chat-row-keys'
import type { MobileNativeChatListHandle } from './use-mobile-native-chat-tail-follow'
import type { MobileNativeChatScrollRoots } from './mobile-native-chat-scroll-roots'
import type { MobileNativeChatHeldRows } from './mobile-native-chat-growth-hold'

export type MobileNativeChatPageListProps = MobileNativeChatHeldRows & {
  roots?: MobileNativeChatScrollRoots
  ref: Ref<MobileNativeChatListHandle>
  isFollowing: () => boolean
  onEndDistance: (fromEnd: number, byReader: boolean) => void
  rowKeys: Pick<MobileNativeChatRowKeys, 'scope' | 'keyOf' | 'current' | 'placement'>
  // Regrouping changes layout, so preserve the reading place through the update.
  layoutKey: string
  contentContainerStyle: StyleProp<ViewStyle>
  emptyStateView: ReactElement | null
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onNearTop?: () => void
}
