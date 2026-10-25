import { app, BrowserWindow, ipcMain, webContents, type WebContents } from 'electron'
import type { Store } from '../persistence'
import { isAgentInjectingInput } from '../browser/agent-input-injection'
import { HoldQuitGesture } from './hold-quit-gesture'
import { watchMacQuitChord } from './macos-quit-chord-watch'
import type { HoldQuitInput, HoldQuitNotice } from '../../shared/mac-hold-quit'
import { isHoldQuitChord } from '../../shared/mac-hold-quit'
import { keybindingMatchesInput, type KeybindingOverrides } from '../../shared/keybindings'
import { readDevToolsShortcutInput } from '../browser/browser-guest-devtools-window'

export function installDesktopHoldQuit(options: {
  store: Pick<Store, 'getSettings' | 'onSettingsChanged'>
  isActivityOwner: (sender: WebContents) => boolean
  isUIRenderer: (sender: WebContents) => boolean
  isLocalWorkActive: () => boolean
  getKeybindings?: () => KeybindingOverrides | undefined
  quit: () => void
  rebuildMenu: () => void
}): () => void {
  if (process.platform !== 'darwin') {
    return () => {}
  }
  const gestures = new Map<WebContents, HoldQuitGesture>()
  const recorders = new Set<number>()
  const detachments = new Map<WebContents, () => void>()
  let activityOwner: WebContents | null = null
  let busy = false
  const enabled = (): boolean => options.store.getSettings().holdQuitWhileAgentsWork === true
  const chordOwned = (): boolean =>
    Object.values(options.getKeybindings?.() ?? {}).some((bindings) =>
      bindings?.some((binding) =>
        keybindingMatchesInput(binding, { code: 'KeyQ', key: 'q', meta: true }, 'darwin')
      )
    )
  const refresh = (): void => {
    for (const gesture of gestures.values()) {
      gesture.refresh()
    }
  }
  const inspecteeFor = (contents: WebContents): WebContents | undefined =>
    webContents
      .getAllWebContents()
      .find((candidate) => !candidate.isDestroyed() && candidate.devToolsWebContents === contents)
  const ownerFor = (contents: WebContents): BrowserWindow | null => {
    if (contents.isDestroyed()) {
      return null
    }
    const owner = inspecteeFor(contents) ?? contents
    return BrowserWindow.fromWebContents(owner.hostWebContents ?? owner)
  }
  const focused = (contents: WebContents): boolean =>
    !contents.isDestroyed() &&
    (inspecteeFor(contents) ? contents.isFocused() : ownerFor(contents)?.isFocused() === true)
  const activity = (event: Electron.IpcMainEvent, value: unknown): void => {
    if (!options.isActivityOwner(event.sender) || typeof value !== 'boolean') {
      return
    }
    activityOwner = event.sender
    busy = value
    refresh()
  }
  const recording = (event: Electron.IpcMainEvent, value: unknown): void => {
    if (!options.isUIRenderer(event.sender)) {
      return
    }
    if (value === true) {
      recorders.add(event.sender.id)
    } else {
      recorders.delete(event.sender.id)
    }
    refresh()
  }
  ipcMain.on('ui:holdQuitActivity', activity)
  ipcMain.on('ui:setShortcutRecorderFocused', recording)

  const attach = (contents: WebContents): void => {
    const sendNotice = (notice: HoldQuitNotice): void => {
      const owner = ownerFor(contents)
      if (owner && !owner.isDestroyed() && !owner.webContents.isDestroyed()) {
        owner.webContents.send('ui:holdQuitNotice', notice)
      }
    }
    const gesture = new HoldQuitGesture({
      isEnabled: enabled,
      isBusy: () => busy || options.isLocalWorkActive(),
      isFocused: () => focused(contents),
      isRecording: () => {
        const owner = ownerFor(contents)
        return chordOwned() || Boolean(owner && recorders.has(owner.webContents.id))
      },
      quit: options.quit,
      notice: sendNotice,
      watch: watchMacQuitChord
    })
    gestures.set(contents, gesture)
    let boundWindow: BrowserWindow | null = null
    const cancel = (): void => gesture.cancel()
    const bindWindow = (): void => {
      const owner = ownerFor(contents)
      if (owner === boundWindow) {
        return
      }
      boundWindow?.off('blur', cancel)
      boundWindow?.off('closed', cancel)
      boundWindow = owner
      boundWindow?.on('blur', cancel)
      boundWindow?.on('closed', cancel)
    }
    // Native chord sampling survives Chromium suppressing releases after a consumed press.
    const onInput = (event: Electron.Event, input: HoldQuitInput): void => {
      if (!enabled()) {
        gesture.cancel()
        return
      }
      if (isAgentInjectingInput(contents)) {
        return
      }
      bindWindow()
      if (isHoldQuitChord(input) && chordOwned()) {
        gesture.cancel()
        return
      }
      const owner = ownerFor(contents)
      if (
        input.type === 'keyDown' &&
        isHoldQuitChord(input) &&
        enabled() &&
        focused(contents) &&
        owner &&
        !recorders.has(owner.webContents.id)
      ) {
        event.preventDefault()
      }
      gesture.input(input)
    }
    const devToolsInput = (event: Electron.Event, inputEvent: Electron.InputEvent): void => {
      if (!enabled() || inputEvent.type !== 'rawKeyDown' || !inspecteeFor(contents)) {
        return
      }
      const input = readDevToolsShortcutInput(inputEvent)
      if (input) {
        onInput(event, { ...input, type: 'keyDown', isAutoRepeat: false })
      }
    }
    const resetRenderer = (): void => {
      recorders.delete(contents.id)
      gesture.cancel()
      if (activityOwner === contents) {
        busy = false
        activityOwner = null
      }
      refresh()
    }
    const navigating = (
      _event: Electron.Event,
      _url: string,
      isInPlace: boolean,
      isMainFrame: boolean
    ): void => {
      if (isMainFrame && !isInPlace) {
        resetRenderer()
      }
    }
    contents.prependListener('before-input-event', onInput)
    contents.on('input-event', devToolsInput)
    contents.on('did-finish-load', bindWindow)
    contents.on('blur', cancel)
    contents.on('render-process-gone', resetRenderer)
    contents.on('did-start-navigation', navigating)
    const detach = (): void => {
      gesture.cancel()
      gestures.delete(contents)
      detachments.delete(contents)
      contents.off('before-input-event', onInput)
      contents.off('input-event', devToolsInput)
      contents.off('did-finish-load', bindWindow)
      contents.off('blur', cancel)
      contents.off('render-process-gone', resetRenderer)
      contents.off('did-start-navigation', navigating)
      contents.off('destroyed', detach)
      boundWindow?.off('blur', cancel)
      boundWindow?.off('closed', cancel)
      recorders.delete(contents.id)
      if (activityOwner === contents) {
        busy = false
        activityOwner = null
        refresh()
      }
    }
    detachments.set(contents, detach)
    contents.once('destroyed', detach)
  }
  const created = (_event: Electron.Event, contents: WebContents): void => attach(contents)
  app.on('web-contents-created', created)
  for (const contents of webContents.getAllWebContents()) {
    attach(contents)
  }
  const unsubscribe = options.store.onSettingsChanged((updates) => {
    if ('holdQuitWhileAgentsWork' in updates) {
      refresh()
      options.rebuildMenu()
    }
  })
  const cancelAll = (): void => {
    for (const gesture of gestures.values()) {
      gesture.cancel()
    }
  }
  app.on('before-quit', cancelAll)
  return () => {
    cancelAll()
    for (const detach of detachments.values()) {
      detach()
    }
    unsubscribe()
    app.off('web-contents-created', created)
    app.off('before-quit', cancelAll)
    ipcMain.off('ui:holdQuitActivity', activity)
    ipcMain.off('ui:setShortcutRecorderFocused', recording)
  }
}
