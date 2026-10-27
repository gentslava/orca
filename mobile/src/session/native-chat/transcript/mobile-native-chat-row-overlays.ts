import { createContext } from 'react'
import type { NativeChatMessage } from '../../../../../src/shared/native-chat-types'
import type { MobileNativeChatVisualSource } from '../visual/mobile-native-chat-visual-read'

export type MobileNativeChatViewedImage = { uri: string; label: string }

// Keep overlays above replaceable rows so echo/transcript swaps cannot close a selected image or actions sheet.
export type MobileNativeChatRowOverlays = {
  imageSource?: MobileNativeChatVisualSource | null
  openImage: (image: MobileNativeChatViewedImage) => void
  openActions: (message: NativeChatMessage) => void
}

export const MobileNativeChatRowOverlaysContext = createContext<MobileNativeChatRowOverlays>({
  openImage: () => {},
  openActions: () => {}
})
