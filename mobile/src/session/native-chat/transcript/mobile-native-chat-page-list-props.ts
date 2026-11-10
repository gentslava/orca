import type { ReactElement, Ref } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native'
import type { NativeChatMessage } from '../../../../../src/shared/native-chat/native-chat-types'
import type { MobileNativeChatRowKeys } from './mobile-native-chat-row-keys'
import type { MobileNativeChatListHandle } from './use-mobile-native-chat-tail-follow'
import type { MobileNativeChatScrollRoots } from './mobile-native-chat-scroll-roots'

type Row = { item: NativeChatMessage; index: number }

export type MobileNativeChatPageListProps = {
  roots?: MobileNativeChatScrollRoots
  ref: Ref<MobileNativeChatListHandle>
  isFollowing: () => boolean
  onEndDistance: (fromEnd: number, byReader: boolean) => void
  rows: readonly NativeChatMessage[]
  rowKeys: Pick<MobileNativeChatRowKeys, 'scope' | 'keyOf' | 'current' | 'placement'>
  renderItem: (row: Row) => ReactElement
  // Regrouping changes layout, so preserve the reading place through the update.
  layoutKey: string
  contentContainerStyle: StyleProp<ViewStyle>
  header: ReactElement | null
  footer: ReactElement | null
  emptyStateView: ReactElement | null
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onNearTop?: () => void
}
