import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react'
import { View, type HostInstance, type StyleProp, type ViewStyle } from 'react-native'

const ComposerMenuHostContext = createContext<RefObject<HostInstance | null> | null>(null)

/** The part of a screen a composer's `/` and `@` menus may cover; every screen with a composer wraps it in one. */
export function MobileNativeChatComposerMenuHost({
  style,
  testID,
  'aria-hidden': ariaHidden,
  children
}: {
  style?: StyleProp<ViewStyle>
  testID?: string
  'aria-hidden'?: boolean
  children: ReactNode
}): React.JSX.Element {
  const ref = useRef<HostInstance>(null)
  return (
    <ComposerMenuHostContext value={ref}>
      <View ref={ref} testID={testID} style={style} aria-hidden={ariaHidden}>
        {children}
      </View>
    </ComposerMenuHostContext>
  )
}

export function useMobileNativeChatComposerMenuHost(): RefObject<HostInstance | null> | null {
  return useContext(ComposerMenuHostContext)
}
