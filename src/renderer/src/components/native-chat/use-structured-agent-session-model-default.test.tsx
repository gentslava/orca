// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AgentSessionOptionResult } from '../../../../shared/agent-session-wire'
import { AGENT_SESSION_DEFAULT_MODEL_CAPABILITY } from '../../../../shared/agent-session-default-model'
import { AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY } from '../../../../shared/agent-session-create-capabilities'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/local-runtime-capabilities'
import { resetHostModelCatalogSnapshotsForTests } from '@/runtime/host-model-catalog-snapshots'
import { useStructuredAgentSessionMutate } from './use-structured-agent-session-mutate'
import { useStructuredAgentSessionOptions } from './use-structured-agent-session-options'
import { useStructuredAgentSessionSendOptions } from './use-structured-agent-session-send-options'
import { useStructuredAgentSessionSends } from './use-structured-agent-session-sends'
import { resetStructuredAgentSessionSendsForTests } from './structured-agent-session-message-sender'
import { FAST_OPTIONS } from './structured-agent-session-option-test-data'
import {
  applyNativeChatSessionOptionSettingsMutation,
  resolveStructuredLaunchSeedOptions
} from '../../../../shared/native-chat-session-option-defaults'
import type {
  NativeChatSessionOptionSettingsMutation,
  PersistedNativeChatSessionOptions
} from '../../../../shared/native-chat-session-options'

const mocks = vi.hoisted(() => ({ call: vi.fn(), enqueue: vi.fn() }))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.call
}))
vi.mock('./native-chat-session-option-settings-write', () => ({
  enqueueSessionOptionSettingsWrite: mocks.enqueue
}))

const TARGET = { kind: 'local' } as const
const QUEUE = { capability: 'supported', enabled: true } as const
const pending = () =>
  Promise.withResolvers<{
    ok: true
    value: AgentSessionOptionResult
  }>()
const resetReply = {
  ok: true,
  value: {
    key: 'model',
    value: null,
    modelDefault: true,
    options: { model: 'gpt-fast', effort: 'low' }
  }
} as const

function renderSession(initial = { sessionId: 'session-1', fence: 1 }) {
  return renderHook(
    ({ sessionId, fence }) => {
      const { mutate } = useStructuredAgentSessionMutate({
        sessionId,
        target: TARGET,
        stateRef: { current: { fence } }
      })
      const options = useStructuredAgentSessionOptions({
        agent: 'claude',
        sessionId,
        target: TARGET,
        transportEnabled: true,
        isVisible: false,
        providerVisible: true,
        fence,
        turnId: null,
        unloadedTurnRevisions: undefined,
        mutate
      })
      const sendOptions = useStructuredAgentSessionSendOptions(
        sessionId,
        undefined,
        options.sendSource
      )
      const sends = useStructuredAgentSessionSends({
        sessionId,
        target: TARGET,
        fence,
        submissions: [],
        queuedMessageIds: [],
        queue: QUEUE,
        historyLoaded: false,
        isWorking: true,
        sendOptions
      })
      return { ...options, sendOptions, sends }
    },
    { initialProps: initial }
  )
}

beforeEach(() => {
  resetHostModelCatalogSnapshotsForTests()
  setLocalRuntimeCapabilitiesForTests([
    AGENT_SESSION_DEFAULT_MODEL_CAPABILITY,
    AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY
  ])
  mocks.call.mockReset()
  mocks.enqueue.mockReset()
  let reads = 0
  mocks.call.mockImplementation((_target, method) =>
    method === 'agentSession.options' && reads++ === 0
      ? Promise.resolve(FAST_OPTIONS)
      : new Promise(() => {})
  )
})

afterEach(() => {
  resetStructuredAgentSessionSendsForTests()
  setLocalRuntimeCapabilitiesForTests(null)
})

it.each([false, true])(
  'keeps Default across effort-only persistence until an explicit model pick (full reply: %s)',
  async (fullReply) => {
    let persisted: PersistedNativeChatSessionOptions = {
      claude: { model: 'gpt-live', valuesByModel: {} }
    }
    mocks.enqueue.mockImplementation(
      (_target, mutation: NativeChatSessionOptionSettingsMutation) => {
        persisted = applyNativeChatSessionOptionSettingsMutation(persisted, mutation) ?? persisted
        return Promise.resolve()
      }
    )
    const read = mocks.call.getMockImplementation()!
    mocks.call.mockImplementation((target, method, params) => {
      if (method !== 'agentSession.setOption') {
        return read(target, method, params)
      }
      return Promise.resolve(
        params.value === null
          ? resetReply
          : {
              ok: true,
              value: {
                key: params.key,
                value: params.value,
                options: {
                  ...(fullReply || params.key === 'model' ? { model: 'gpt-fast' } : {}),
                  effort: params.key === 'effort' ? params.value : 'medium'
                }
              }
            }
      )
    })
    const { result, unmount } = renderSession()
    await waitFor(() => expect(result.current.sendOptions()).toBeDefined())
    await act(async () => {
      await result.current.optionSurface.resetOption?.('model')
    })
    expect(resolveStructuredLaunchSeedOptions(persisted, 'claude')).toBeUndefined()
    for (const effort of ['medium', 'low']) {
      await act(async () => {
        expect(await result.current.setStructuredOption('effort', effort)).toBe(true)
      })
      expect(persisted.claude?.valuesByModel?.['gpt-fast']?.effort).toBe(effort)
      expect(resolveStructuredLaunchSeedOptions(persisted, 'claude')).toBeUndefined()
      expect(
        result.current.optionSnapshot.find((row) => row.id === 'model')?.defaultChoice?.selected
      ).toBe(true)
      expect(result.current.sendOptions()).toBeUndefined()
    }
    await act(async () => {
      expect(await result.current.setStructuredOption('model', 'gpt-fast')).toBe(true)
    })
    expect(resolveStructuredLaunchSeedOptions(persisted, 'claude')).toEqual({
      model: 'gpt-fast',
      effort: 'medium'
    })
    expect(
      result.current.optionSnapshot.find((row) => row.id === 'model')?.defaultChoice?.selected
    ).toBe(false)
    unmount()
  }
)

it.each([
  ['effort', 'high', 'high'],
  ['fastMode', true, 'medium']
] as const)(
  'restores send options after a reset superseded by %s settles',
  async (id, value, effort) => {
    const reset = pending()
    const pick = pending()
    const read = mocks.call.getMockImplementation()!
    mocks.call.mockImplementation((target, method, params) =>
      method === 'agentSession.setOption'
        ? params.value === null
          ? reset.promise
          : pick.promise
        : read(target, method, params)
    )
    const { result, unmount } = renderSession()
    await waitFor(() =>
      expect(result.current.sendOptions()).toEqual({ model: 'gpt-live', effort: 'medium' })
    )
    let resetting: Promise<unknown> | undefined
    let picking: Promise<boolean> | undefined
    act(() => {
      resetting = result.current.optionSurface.resetOption?.('model')
    })
    act(() => {
      picking = result.current.setStructuredOption(id, value)
    })
    await act(async () => {
      pick.resolve({
        ok: true,
        value: {
          key: id,
          value: String(value),
          options: { model: 'gpt-live', effort, ...(id === 'fastMode' ? { fastMode: 'true' } : {}) }
        }
      })
      expect(await picking).toBe(true)
    })
    expect(result.current.sendOptions()).toBeUndefined()
    await act(async () => {
      reset.resolve(resetReply)
      await resetting
    })
    expect(mocks.enqueue).not.toHaveBeenCalledWith(TARGET, { type: 'clear-model', agent: 'claude' })
    act(() => {
      expect(result.current.sends.send('follow up')).toBe('queued')
    })
    await waitFor(() =>
      expect(
        mocks.call.mock.calls.find(([, method]) => method === 'agentSession.send')?.[2]
      ).toMatchObject({ options: { model: 'gpt-live', effort } })
    )
    unmount()
  }
)

it('keeps a newer reset pending when a superseded old reset finishes', async () => {
  const oldReset = pending()
  const newReset = pending()
  const pick = pending()
  const read = mocks.call.getMockImplementation()!
  let resets = 0
  mocks.call.mockImplementation((target, method, params) =>
    method === 'agentSession.setOption'
      ? params.value === null
        ? ++resets === 1
          ? oldReset.promise
          : newReset.promise
        : pick.promise
      : read(target, method, params)
  )
  const { result, unmount } = renderSession()
  await waitFor(() => expect(result.current.sendOptions()).toBeDefined())
  let old: Promise<unknown> | undefined
  let newer: Promise<unknown> | undefined
  let picking: Promise<boolean> | undefined
  act(() => {
    old = result.current.optionSurface.resetOption?.('model')
  })
  act(() => {
    picking = result.current.setStructuredOption('effort', 'high')
  })
  act(() => {
    newer = result.current.optionSurface.resetOption?.('model')
  })
  await act(async () => {
    oldReset.resolve(resetReply)
    pick.resolve({ ok: true, value: { key: 'effort', value: 'high', options: { effort: 'high' } } })
    await Promise.all([old, picking])
  })
  expect(resets).toBe(2)
  expect(result.current.sendOptions()).toBeUndefined()
  await act(async () => {
    newReset.resolve(resetReply)
    await newer
  })
  expect(
    result.current.optionSnapshot.find((entry) => entry.id === 'model')?.defaultChoice?.selected
  ).toBe(true)
  expect(mocks.enqueue).toHaveBeenCalledWith(TARGET, {
    type: 'clear-model',
    agent: 'claude'
  })
  unmount()
})

it.each([
  { sessionId: 'session-2', fence: 1 },
  { sessionId: 'session-1', fence: 2 }
])('keeps the new context reset pending after switching to %j', async (context) => {
  const oldReset = pending()
  const newReset = pending()
  let resets = 0
  mocks.call.mockImplementation((_target, method) =>
    method === 'agentSession.setOption'
      ? ++resets === 1
        ? oldReset.promise
        : newReset.promise
      : method === 'agentSession.options' && resets < 2
        ? Promise.resolve(FAST_OPTIONS)
        : new Promise(() => {})
  )
  const { result, rerender, unmount } = renderSession()
  await waitFor(() => expect(result.current.sendOptions()).toBeDefined())
  let old: Promise<unknown> | undefined
  let newer: Promise<unknown> | undefined
  act(() => {
    old = result.current.optionSurface.resetOption?.('model')
  })
  rerender(context)
  await waitFor(() => expect(result.current.rewind).toBeDefined())
  act(() => {
    newer = result.current.optionSurface.resetOption?.('model')
  })
  expect(resets).toBe(2)
  expect(result.current.sendOptions()).toBeUndefined()
  await act(async () => {
    oldReset.resolve(resetReply)
    await old
  })
  expect(result.current.sendOptions()).toBeUndefined()
  expect(mocks.enqueue).not.toHaveBeenCalled()
  await act(async () => {
    newReset.resolve(resetReply)
    await newer
  })
  expect(
    result.current.optionSnapshot.find((entry) => entry.id === 'model')?.defaultChoice?.selected
  ).toBe(true)
  unmount()
})
