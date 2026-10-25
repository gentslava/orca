import { translateMain } from '../i18n/main-i18n'
import { hasFocusedDesktopHoldQuitSurface } from '../window/desktop-hold-quit-surface'

type AppMenuQuitItem = Omit<Electron.MenuItemConstructorOptions, 'click'> & {
  click?: () => void
}

/** Use onQuit so persistent hosts can refuse user Quit; the native guard covers only macOS. */
export function createAppMenuQuitItem(
  onQuit: (() => void) | undefined,
  macAppName?: string,
  holdShortcut?: { isEnabled: () => boolean; quit: () => void }
): AppMenuQuitItem {
  const exitLabel = macAppName === undefined ? translateMain('menu.exit', 'Exit') : undefined
  if (
    process.platform === 'darwin' &&
    holdShortcut?.isEnabled() &&
    hasFocusedDesktopHoldQuitSurface()
  ) {
    return {
      label: `${translateMain('menu.quitApp', `Quit ${macAppName}`, { appName: macAppName })}\t⌘Q`,
      click: () => holdShortcut.quit()
    }
  }
  if (!onQuit) {
    return { role: 'quit', ...(exitLabel ? { label: exitLabel } : {}) }
  }
  return {
    label:
      exitLabel ?? translateMain('menu.quitApp', `Quit ${macAppName}`, { appName: macAppName }),
    // Match Electron quit accelerators, including no accelerator on Windows.
    ...(process.platform === 'win32' ? {} : { accelerator: 'CmdOrCtrl+Q' }),
    click: () => onQuit()
  }
}
