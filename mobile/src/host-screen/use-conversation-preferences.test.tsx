import { createElement, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  CONVERSATION_NAVIGATION_CAPABILITY,
  SetConversationPreferenceParams,
  updateConversationPreference
} from '../../../src/shared/conversation-navigation-preferences'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import { FakeSession } from '../transport/mobile-endpoint-supervisor-test-fakes'
import { INITIAL_MOBILE_VIEW, type MobileViewState } from '../worktree/workspace-view-settings'
import { useConversationPreferences } from './use-conversation-preferences'

function endpoint() {
  let preferences = { revision: 0, entries: {} }
  const sendRequest = vi.fn<RpcClient['sendRequest']>(async (_method, params) => {
    preferences = updateConversationPreference(
      preferences,
      SetConversationPreferenceParams.parse(params)
    )
    return { id: 'write', ok: true, result: { preferences } }
  })
  return { client: { ...new FakeSession('connected'), sendRequest }, sendRequest }
}

describe('host-owned mobile conversation preferences', () => {
  it('applies atomic chat changes and rejects a prior host completion after cutover', async () => {
    const first = endpoint()
    const second = endpoint()
    let client: RpcClient = first.client
    let hostId = 'first'
    const observed: {
      current: ReturnType<typeof useConversationPreferences> | null
      view: MobileViewState
    } = { current: null, view: INITIAL_MOBILE_VIEW }
    const viewRef = { current: INITIAL_MOBILE_VIEW }
    function Probe() {
      const [view, setView] = useState<MobileViewState>(INITIAL_MOBILE_VIEW)
      viewRef.current = view
      observed.view = view
      observed.current = useConversationPreferences({
        client,
        hostId,
        connState: 'connected',
        hostCapabilities: [CONVERSATION_NAVIGATION_CAPABILITY],
        state: { view, viewRef, setView }
      })
      return null
    }
    let tree: ReactTestRenderer | undefined
    try {
      await act(async () => {
        tree = create(createElement(Probe))
      })
      await act(async () => {
        expect(await observed.current?.setPreference('chat', { pinned: true })).toBe(true)
      })
      expect(observed.view.conversationPreferences).toEqual({
        revision: 1,
        entries: { chat: { pinned: true } }
      })

      let resolveOld: (reply: RpcResponse) => void = () => {}
      first.sendRequest.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          })
      )
      let pending: Promise<boolean> | undefined
      act(() => {
        pending = observed.current?.setPreference('chat', { archived: true })
      })
      expect(observed.current?.writing).toBe(true)
      client = second.client
      hostId = 'second'
      await act(async () => tree?.update(createElement(Probe)))
      expect(observed.current?.writing).toBe(false)
      await act(async () => {
        expect(await observed.current?.setPreference('second-chat', { archived: true })).toBe(true)
      })
      expect(observed.view.conversationPreferences?.entries).toEqual({
        'second-chat': { archived: true }
      })

      await act(async () => {
        resolveOld({
          id: 'old-write',
          ok: true,
          result: { preferences: { revision: 999, entries: { chat: { archived: true } } } }
        })
        expect(await pending).toBe(false)
      })
      expect(observed.view.conversationPreferences?.entries).toEqual({
        'second-chat': { archived: true }
      })
    } finally {
      act(() => tree?.unmount())
    }
  })
})
