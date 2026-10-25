import type { BaseWindow, BrowserWindow, WebContents } from 'electron'
import type { HoldQuitNotice } from '../../shared/mac-hold-quit'

// Window-wide menu and renderer routing must distinguish web popups from Orca renderers.
const nativeBrowserPopupWindows = new WeakSet<BrowserWindow>()
export type NativePopupQuitSurface = {
  window: BaseWindow
  notice: (notice: HoldQuitNotice) => void
}
const popupQuitSurfaces = new WeakMap<object, NativePopupQuitSurface>()

export function registerNativePopupQuitSurface(
  contents: WebContents,
  surface: NativePopupQuitSurface
): () => void {
  popupQuitSurfaces.set(contents, surface)
  return () => {
    if (popupQuitSurfaces.get(contents) === surface) {
      popupQuitSurfaces.delete(contents)
    }
  }
}

export function getNativePopupQuitSurface(contents: object): NativePopupQuitSurface | undefined {
  return popupQuitSurfaces.get(contents)
}

export function markNativeBrowserPopupWindow(window: BrowserWindow): void {
  nativeBrowserPopupWindows.add(window)
}

export function isNativeBrowserPopupWindow(window: BrowserWindow | null | undefined): boolean {
  return window != null && nativeBrowserPopupWindows.has(window)
}
