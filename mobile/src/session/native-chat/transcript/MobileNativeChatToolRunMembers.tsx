import { useCallback, useContext, useLayoutEffect, useRef, useState } from 'react'
import {
  Platform,
  type ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native'
import { MobileNativeChatOpenedDetailContext } from '../visual/mobile-native-chat-opened-detail'
import {
  MAX_DISCLOSURES,
  MobileNativeChatDisclosureContext
} from './mobile-native-chat-disclosure-store'
import { toolStyles as styles } from './mobile-native-chat-tool-styles'
import { MobileNativeChatOwnedScrollView } from '../../MobileNativeChatOwnedScrollView'

/** Desktop's 18rem: an opened run lists this much before it scrolls in place. */
const MEMBERS_MIN_HEIGHT = 288
const FOLLOW_REARM_PX = 24

export function MobileNativeChatToolRunMembers({
  followKey,
  startsAtEnd,
  memoryKey,
  owner,
  children
}: {
  // Follow only new work, not a reader opening existing detail.
  followKey: number
  startsAtEnd: boolean
  memoryKey?: string
  owner?: string
  children: React.ReactNode
}): React.JSX.Element {
  const { height } = useWindowDimensions()
  const store = useContext(MobileNativeChatDisclosureContext)
  const runScroll = store?.runScroll
  const owned = Platform.OS === 'web' && store !== null
  const [remembered] = useState(() =>
    memoryKey === undefined ? undefined : runScroll?.get(memoryKey)
  )
  const scroller = useRef<ScrollView>(null)
  const followsEnd = useRef(remembered?.followsEnd ?? startsAtEnd)
  const pendingRestore = useRef(remembered !== undefined && !remembered.followsEnd)
  // Decide follow in the work update so later detail expansion cannot inherit it.
  useLayoutEffect(() => {
    if (!owned && followsEnd.current) {
      scroller.current?.scrollToEnd({ animated: false })
    }
  }, [followKey, owned])
  const details = useRef(new Map<string, number>())
  const [openedHeight, setOpenedHeight] = useState(0)
  const reportDetail = useCallback((detailId: string, detailHeight: number | null) => {
    if (detailHeight === null) {
      details.current.delete(detailId)
    } else {
      details.current.set(detailId, detailHeight)
    }
    let total = 0
    for (const value of details.current.values()) {
      total += value
    }
    setOpenedHeight(total)
  }, [])
  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent
    followsEnd.current =
      contentSize.height - contentOffset.y - layoutMeasurement.height <= FOLLOW_REARM_PX
    if (!owned && runScroll && memoryKey !== undefined) {
      runScroll.delete(memoryKey)
      runScroll.set(memoryKey, { top: contentOffset.y, followsEnd: followsEnd.current })
      if (runScroll.size > MAX_DISCLOSURES) {
        const oldest = runScroll.keys().next().value
        if (oldest !== undefined) {
          runScroll.delete(oldest)
        }
      }
    }
  }
  // Restore the saved offset only after content layout exists.
  const onContentSizeChange = () => {
    if (!owned && pendingRestore.current && remembered) {
      pendingRestore.current = false
      scroller.current?.scrollTo({ y: remembered.top, animated: false })
    }
  }
  return (
    <MobileNativeChatOpenedDetailContext.Provider value={reportDetail}>
      <MobileNativeChatOwnedScrollView
        positionKey={memoryKey ?? `run:${owner ?? 'local'}`}
        rootIdentity={`run:${owner ?? 'local'}`}
        owner={owner}
        initialFollow={startsAtEnd}
        followKey={followKey}
        ref={scroller}
        style={[
          styles.members,
          { maxHeight: Math.min(height / 2, MEMBERS_MIN_HEIGHT + openedHeight) }
        ]}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={onScroll}
        onContentSizeChange={onContentSizeChange}
      >
        {children}
      </MobileNativeChatOwnedScrollView>
    </MobileNativeChatOpenedDetailContext.Provider>
  )
}
