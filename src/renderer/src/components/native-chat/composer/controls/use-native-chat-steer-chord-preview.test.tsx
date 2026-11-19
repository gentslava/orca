// @vitest-environment happy-dom
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  useNativeChatSteerChordPreview,
  NATIVE_CHAT_STEER_CHORD_HOLD_MS
} from './use-native-chat-steer-chord-preview'

vi.mock('../../pane/routing/native-chat-shortcut', () => ({ isMacPlatform: () => true }))
let element: HTMLDivElement | undefined
beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  element?.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it.each([
  { hasDraft: false, sendHeld: false, preview: 'steer-queued', queued: 1, sent: 0 },
  { hasDraft: true, sendHeld: false, preview: 'steer', queued: 0, sent: 1 },
  { hasDraft: false, sendHeld: true, preview: null, queued: 0, sent: 0 },
  { hasDraft: true, sendHeld: true, preview: null, queued: 0, sent: 0 }
])(
  'Cmd preview and send with draft $hasDraft, held $sendHeld',
  ({ hasDraft, sendHeld, preview, queued, sent }) => {
    element = document.body.appendChild(document.createElement('div'))
    const field = element.appendChild(document.createElement('textarea'))
    const root = { current: element }
    const steerQueued = vi.fn(() => true)
    const send = vi.fn()
    const { result } = renderHook(() =>
      useNativeChatSteerChordPreview(
        root,
        {
          hasDraft,
          sendHeld,
          alternateSend: 'steer',
          chordSteersQueued: true
        },
        steerQueued,
        send,
        false
      )
    )
    fireEvent.keyDown(field, { key: 'Meta' })
    act(() => vi.advanceTimersByTime(NATIVE_CHAT_STEER_CHORD_HOLD_MS))
    expect(result.current.preview).toBe(preview)
    act(() => result.current.runPreview())
    expect(steerQueued).toHaveBeenCalledTimes(queued)
    expect(send).toHaveBeenCalledTimes(sent)
  }
)
