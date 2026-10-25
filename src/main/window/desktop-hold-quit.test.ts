import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../shared/constants'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { HoldQuitWatchEvent } from './hold-quit-gesture'
import type { KeybindingOverrides } from '../../shared/keybindings'

const mocks = vi.hoisted(() => {
  const watches: { emit: (event: HoldQuitWatchEvent) => void; cancel: ReturnType<typeof vi.fn> }[] =
    []
  return { watches, injected: false }
})
class Contents extends EventEmitter {
  hostWebContents: Contents | undefined
  devToolsWebContents: Contents | undefined
  destroyed = false
  send = vi.fn()
  constructor(readonly id: number) {
    super()
  }
  isDestroyed() {
    return this.destroyed
  }
  isFocused() {
    return true
  }
}
const ipc = new EventEmitter()
const app = new EventEmitter()
const main = new Contents(1)
const guest = new Contents(2)
guest.hostWebContents = main
const popout = new Contents(3)
const mainWindow = Object.assign(new EventEmitter(), {
  isFocused: () => true,
  isDestroyed: () => false,
  webContents: main
})
const popoutWindow = Object.assign(new EventEmitter(), {
  isFocused: () => true,
  isDestroyed: () => false,
  webContents: popout
})
const popupWindow = Object.assign(new EventEmitter(), {
  isFocused: () => true,
  isDestroyed: () => false
})
const popupNotice = vi.fn()
vi.mock('../browser/native-browser-popup-windows', () => ({
  getNativePopupQuitSurface: (contents: Contents) =>
    contents.id === 5 ? { window: popupWindow, notice: popupNotice } : undefined
}))
vi.mock('electron', () => ({
  app,
  ipcMain: ipc,
  webContents: { getAllWebContents: () => [main, guest, popout] },
  BrowserWindow: {
    fromWebContents: (contents: Contents) => (contents.id === popout.id ? popoutWindow : mainWindow)
  }
}))
vi.mock('../browser/agent-input-injection', () => ({ isAgentInjectingInput: () => mocks.injected }))
vi.mock('./macos-quit-chord-watch', () => ({
  watchMacQuitChord: (_code: string, emit: (event: HoldQuitWatchEvent) => void) => {
    const cancel = vi.fn()
    mocks.watches.push({ emit, cancel })
    return cancel
  }
}))
const { installDesktopHoldQuit } = await import('./desktop-hold-quit')
const platform = Object.getOwnPropertyDescriptor(process, 'platform')
afterEach(() => {
  if (platform) {
    Object.defineProperty(process, 'platform', platform)
  }
  for (const emitter of [ipc, app, main, guest, popout, mainWindow, popoutWindow, popupWindow]) {
    emitter.removeAllListeners()
  }
  mocks.watches = []
  mocks.injected = false
  main.send.mockClear()
  popout.send.mockClear()
  popupNotice.mockClear()
})

it('guards BaseWindow popup contents and delivers native-ack progress only to its trusted notice owner', () => {
  const f = fixture()
  const popupContents = new Contents(5)
  app.emit('web-contents-created', {}, popupContents)
  ipc.emit('ui:holdQuitActivity', { sender: popupContents }, true)
  ipc.emit('ui:holdQuitActivity', { sender: main }, true)
  ipc.emit('ui:holdQuitActivity', { sender: popupContents }, false)
  key(popupContents)
  expect(popupNotice).toHaveBeenLastCalledWith({ phase: 'starting' })
  mocks.watches[0]?.emit('watching')
  expect(popupNotice).toHaveBeenLastCalledWith({ phase: 'holding' })
  key(popupContents, 'keyUp')
  expect(popupNotice).toHaveBeenLastCalledWith({ phase: 'released' })
  mocks.watches[0]?.emit('held')
  key(popupContents)
  popupWindow.emit('blur')
  mocks.watches[1]?.emit('held')
  expect(f.quit).not.toHaveBeenCalled()
  popupContents.emit('destroyed')
  f.dispose()
})

function fixture(platform = 'darwin') {
  Object.defineProperty(process, 'platform', { value: platform })
  let bindings: KeybindingOverrides | undefined
  let settings = { ...getDefaultSettings('/tmp'), holdQuitWhileAgentsWork: true }
  let changed: (updates: Partial<GlobalSettings>, settings: GlobalSettings) => void = () => {}
  const quit = vi.fn()
  const rebuildMenu = vi.fn()
  const dispose = installDesktopHoldQuit({
    store: {
      getSettings: () => settings,
      onSettingsChanged: (listener) => {
        changed = listener
        return () => {}
      }
    },
    isActivityOwner: (sender) => sender.id === main.id,
    isUIRenderer: (sender) => sender.id === main.id || sender.id === popout.id,
    isLocalWorkActive: () => false,
    getKeybindings: () => bindings,
    quit,
    rebuildMenu
  })
  return {
    quit,
    dispose,
    rebuildMenu,
    bindQ: () => {
      bindings = { 'app.settings': ['Cmd+Q'] }
    },
    disable: () => {
      settings = { ...settings, holdQuitWhileAgentsWork: false }
      changed({ holdQuitWhileAgentsWork: false }, settings)
    }
  }
}

it.each(['linux', 'win32'])('leaves %s input and lifecycle listeners untouched', (platform) => {
  const f = fixture(platform)
  ipc.emit('ui:holdQuitActivity', { sender: main }, true)
  expect(key(main).preventDefault).not.toHaveBeenCalled()
  expect(mocks.watches).toHaveLength(0)
  expect(f.quit).not.toHaveBeenCalled()
  expect(app.listenerCount('before-quit')).toBe(0)
  f.dispose()
})

it('cancels on owning window blur and yields when CmdQ acquires another shortcut owner', () => {
  const f = fixture()
  ipc.emit('ui:holdQuitActivity', { sender: main }, true)
  key(main)
  mainWindow.emit('blur')
  mocks.watches[0]?.emit('held')
  key(main)
  f.bindQ()
  mocks.watches[1]?.emit('held')
  expect(key(main).preventDefault).not.toHaveBeenCalled()
  expect(mocks.watches).toHaveLength(2)
  expect(f.quit).not.toHaveBeenCalled()
  f.dispose()
})
function key(contents: Contents, type = 'keyDown', key = 'q', meta = true) {
  const event = { preventDefault: vi.fn() }
  contents.emit('before-input-event', event, {
    type,
    key,
    code: key === 'q' ? 'KeyQ' : 'MetaLeft',
    meta,
    isAutoRepeat: false
  })
  return event
}

it('routes all UI holds and consumes embedded page Q before its DOM receives it', () => {
  const f = fixture()
  ipc.emit('ui:holdQuitActivity', { sender: main }, true)
  for (const contents of [main, guest, popout]) {
    const event = key(contents)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    const watch = mocks.watches.at(-1)
    key(contents, 'keyUp')
    expect(watch?.cancel).toHaveBeenCalledOnce()
    watch?.emit('held')
  }
  expect(f.quit).not.toHaveBeenCalled()
  expect(main.send).toHaveBeenCalledWith('ui:holdQuitNotice', { phase: 'starting' })
  expect(popout.send).toHaveBeenCalledWith('ui:holdQuitNotice', { phase: 'starting' })
  f.dispose()
})

it('clears recorder ownership and pending work on renderer loss or navigation', () => {
  const f = fixture()
  ipc.emit('ui:holdQuitActivity', { sender: main }, true)
  for (const reason of ['render-process-gone', 'did-start-navigation']) {
    ipc.emit('ui:setShortcutRecorderFocused', { sender: main }, true)
    main.emit(reason, {}, 'about:blank', false, true)
    ipc.emit('ui:holdQuitActivity', { sender: main }, true)
    key(main)
  }
  expect(mocks.watches).toHaveLength(2)
  f.dispose()
})

it('routes guest DevTools raw input through its existing input-event lane to the owning UI', () => {
  const f = fixture()
  const tools = new Contents(4)
  guest.devToolsWebContents = tools
  app.emit('web-contents-created', {}, tools)
  ipc.emit('ui:holdQuitActivity', { sender: main }, true)
  const event = { preventDefault: vi.fn() }
  tools.emit('input-event', event, {
    type: 'rawKeyDown',
    key: 'q',
    code: 'KeyQ',
    modifiers: ['meta']
  })
  expect(event.preventDefault).toHaveBeenCalledOnce()
  expect(main.send).toHaveBeenCalledWith('ui:holdQuitNotice', { phase: 'starting' })
  mocks.watches[0]?.emit('held')
  expect(f.quit).toHaveBeenCalledOnce()
  tools.emit('blur')
  guest.devToolsWebContents = undefined
  f.dispose()
})

it('admits activity only from its desktop view owner and preserves off/menu lifecycle routes', () => {
  const f = fixture()
  ipc.emit('ui:holdQuitActivity', { sender: guest }, true)
  key(main)
  expect(f.quit).toHaveBeenCalledOnce()
  expect(mocks.watches).toHaveLength(0)
  ipc.emit('ui:holdQuitActivity', { sender: main }, true)
  key(main)
  f.disable()
  mocks.watches[0]?.emit('held')
  expect(f.quit).toHaveBeenCalledOnce()
  expect(f.rebuildMenu).toHaveBeenCalledOnce()
  key(main)
  expect(f.quit).toHaveBeenCalledOnce()
  f.dispose()
})

it('respects shortcut recording, agent input ownership, blur and destruction', () => {
  const f = fixture()
  ipc.emit('ui:holdQuitActivity', { sender: main }, true)
  ipc.emit('ui:setShortcutRecorderFocused', { sender: main }, true)
  key(main)
  expect(mocks.watches).toHaveLength(0)
  ipc.emit('ui:setShortcutRecorderFocused', { sender: main }, false)
  mocks.injected = true
  key(guest)
  expect(mocks.watches).toHaveLength(0)
  mocks.injected = false
  for (const reason of ['blur', 'destroyed']) {
    key(guest)
    const watch = mocks.watches.at(-1)
    guest.emit(reason)
    watch?.emit('held')
  }
  expect(f.quit).not.toHaveBeenCalled()
  f.dispose()
})
