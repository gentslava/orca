import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalDispatchState } from '../../../src/shared/agent-session-journal-types'
import { DISPATCH_REJECTED_CANCELLED } from '../../../src/shared/structured-agent-session-dispatch-rejection'
import type { RpcClient } from '../transport/rpc-client'
import {
  fieldsOf,
  mutationOk,
  ok,
  snapshotEvent
} from './use-mobile-structured-agent-session-queued.test-fixture'
import { markRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import { structuredSendResultFixture } from './structured-agent-send-result.test-fixture'
import { useMobileStructuredAgentSession } from './use-mobile-structured-agent-session'
import { AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY } from '../../../src/shared/agent-session-create-capabilities'
import { AGENT_SESSION_DEFAULT_MODEL_CAPABILITY } from '../../../src/shared/agent-session-default-model'
import type { AgentSessionOptionsResult } from '../../../src/shared/agent-session-wire'
import type { RpcResponse } from '../transport/types'
import { useMobileStructuredNativeChatSendBridge } from './use-mobile-structured-native-chat-send-bridge'
import type { MobileNativeChatSendOrigin } from './use-mobile-native-chat-drafts'
import {
  structuredAgentSessionHostSupport,
  type StructuredAgentSessionHostSupport
} from './mobile-structured-agent-session-host-support'
import { agentSessionFailureWords } from '../../../src/shared/agent-session-failure-words'
import { mobileNativeChatUnsentNotices } from './mobile-native-chat-unsent-notices'
import { agentJournalSubmissionKey } from '../../../src/shared/agent-session-journal-item-key'
import {
  useMobileNativeChatSendError,
  type MobileNativeChatSendErrorDetails
} from './use-mobile-native-chat-send-error'

const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
}))

vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorage }))

function sendResult(dispatchState: AgentJournalDispatchState, reason: string | null = null) {
  return ok({
    ok: true,
    replayed: false,
    fence: 3,
    cursor: { epoch: 'epoch-1', sequence: 1 },
    value: structuredSendResultFixture(dispatchState, reason)
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

const MODEL_OPTIONS: AgentSessionOptionsResult = {
  conversationCommands: ['compact'],
  models: [
    { id: 'opus', label: 'Opus', isDefault: true, efforts: [] },
    { id: 'sonnet', label: 'Sonnet', isDefault: false, efforts: [] }
  ],
  current: { model: 'opus' }
}

describe('mobile structured send actions', () => {
  let renderer: ReactTestRenderer | null = null
  let hook: ReturnType<typeof useMobileStructuredAgentSession> | null = null
  let banner: ReturnType<typeof useMobileNativeChatSendError> | null = null
  let listener: ((value: unknown) => void) | null = null
  let storedOperations: Map<string, string>
  let agent = 'codex'
  let sessionId = 'session-1'
  let hostSupport: StructuredAgentSessionHostSupport | null = null
  let bridge: ReturnType<typeof useMobileStructuredNativeChatSendBridge>
  const clearDraftForSend = vi.fn()
  const restoreRejectedDraft = vi.fn()
  const captureSendOrigin = vi.fn((text: string): MobileNativeChatSendOrigin => ({
    draftKey: 'draft',
    draftEditGeneration: 0,
    pendingKey: 'pending',
    normalizedText: text,
    baselineOccurrences: 0,
    baselineTailMessageId: null,
    baselineResolved: true,
    sentAt: 0
  }))
  const onSendError = vi.fn()
  const sendRequest = vi.fn<RpcClient['sendRequest']>()
  const subscribe = vi.fn<RpcClient['subscribe']>((_method, _params, onData) => {
    listener = onData
    return vi.fn()
  })
  const client: RpcClient = {
    sendRequest,
    subscribe,
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }

  function Harness() {
    banner = useMobileNativeChatSendError({ scopeKey: 'session-1', showToast: vi.fn() })
    banner.bannerMountedRef.current = true
    hook = useMobileStructuredAgentSession({
      client,
      sessionId,
      sourceIdentity: 'host-a\0workspace-a',
      enabled: true,
      connected: true,
      agent,
      hostSupport,
      onSendError
    })
    bridge = useMobileStructuredNativeChatSendBridge({
      agent: 'claude',
      sendStructured: hook.sendWithOutcome,
      isModelWritePending: hook.isModelWritePending,
      captureSendOrigin,
      clearDraftForSend,
      restoreRejectedDraft,
      onSendError
    })
    return createElement('span', null, banner.message)
  }

  async function mountSession(): Promise<void> {
    act(() => {
      renderer = create(createElement(Harness))
    })
    await vi.waitFor(() => expect(listener).toEqual(expect.any(Function)))
    act(() => listener?.(snapshotEvent()))
  }

  function calls() {
    return sendRequest.mock.calls.filter(([method]) => method === 'agentSession.send')
  }

  function sentIds(): string[] {
    return calls().map(([, params]) =>
      String(fieldsOf(fieldsOf(params).envelope).clientOperationId)
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    onSendError.mockImplementation((message: string, details?: MobileNativeChatSendErrorDetails) =>
      banner?.show(message, details)
    )

    storedOperations = new Map()
    asyncStorage.getItem.mockImplementation(
      async (key: string) => storedOperations.get(key) ?? null
    )
    asyncStorage.setItem.mockImplementation(async (key: string, value: string) => {
      storedOperations.set(key, value)
    })
    asyncStorage.removeItem.mockImplementation(async (key: string) => {
      storedOperations.delete(key)
    })
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.options' ? ok({ models: [], current: {} }) : ok({})
    )
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    hook = null
    banner = null
    listener = null
    agent = 'codex'
    sessionId = 'session-1'
    hostSupport = null
  })

  it.each([
    ['carries the shown model and effort to a host that takes them', true],
    ['sends the old shape to a host that does not', false]
  ])('%s', async (_name, takesOptions) => {
    agent = 'claude'
    hostSupport = structuredAgentSessionHostSupport(
      takesOptions ? [AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY] : []
    )
    const high = [
      { value: 'low', label: 'Low' },
      { value: 'high', label: 'High' }
    ]
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.send'
        ? sendResult('accepted')
        : method === 'agentSession.options'
          ? ok({
              models: [{ id: 'opus[1m]', label: 'Opus', isDefault: true, efforts: high }],
              current: { model: 'opus[1m]', effort: 'high' }
            })
          : ok({})
    )
    await mountSession()
    await act(async () => {
      await vi.waitFor(() =>
        expect(sendRequest.mock.calls.some(([method]) => method === 'agentSession.options')).toBe(
          true
        )
      )
    })
    await act(async () => {
      expect(await hook!.sendWithOutcome('hello')).toBe('accepted')
      expect(await hook!.sendWithOutcome('again')).toBe('accepted')
    })
    for (const [, params] of calls()) {
      if (takesOptions) {
        expect(fieldsOf(params).options).toEqual({ model: 'opus[1m]', effort: 'high' })
      } else {
        expect(fieldsOf(params)).not.toHaveProperty('options')
      }
    }
  })

  it("keeps a chat's model its CLI stopped listing, and sends on it and its effort", async () => {
    agent = 'claude'
    hostSupport = structuredAgentSessionHostSupport([AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY])
    const opus = {
      id: 'opus',
      label: 'Opus',
      isDefault: true,
      efforts: [{ value: 'high', label: 'High' }]
    }
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.send'
        ? sendResult('accepted')
        : method === 'agentSession.modelCatalog'
          ? ok({ origin: 'probe', fetchedAt: 1, models: [opus] })
          : method === 'agentSession.options'
            ? ok({
                models: [
                  opus,
                  { id: 'opus[1m]', label: 'opus[1m]', isDefault: false, efforts: [] }
                ],
                listedModelIds: ['opus'],
                current: { model: 'opus[1m]', effort: 'max' }
              })
            : ok({})
    )
    await mountSession()
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(
        hook!.optionSnapshot.find((descriptor) => descriptor.id === 'model')?.kind
      ).toMatchObject({ currentValue: 'opus[1m]' })
    })
    expect(hook!.optionSnapshot.find((descriptor) => descriptor.id === 'effort')).toMatchObject({
      settable: false,
      kind: { currentValue: 'max' }
    })
    await act(async () => {
      expect(await hook!.sendWithOutcome('hello')).toBe('accepted')
    })
    expect(fieldsOf(calls()[0]![1]).options).toEqual({ model: 'opus[1m]', effort: 'max' })
  })

  it.each([
    ['explicit model', true, false],
    ['Default reset', true, true],
    ['legacy explicit model', false, false],
    ['legacy Default reset', false, true]
  ] as const)(
    'rejects a send during a pending %s, then sends the accepted selection',
    async (_name, takesOptions, reset) => {
      agent = 'claude'
      hostSupport = structuredAgentSessionHostSupport([
        AGENT_SESSION_DEFAULT_MODEL_CAPABILITY,
        ...(takesOptions ? [AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY] : [])
      ])
      const write = deferred<RpcResponse>()
      let current = MODEL_OPTIONS.current
      sendRequest.mockImplementation(async (method) => {
        if (method === 'agentSession.setOption') {
          return write.promise
        }
        if (method === 'agentSession.send') {
          return sendResult('accepted')
        }
        if (method === 'agentSession.options') {
          return ok({ ...MODEL_OPTIONS, current })
        }
        return ok({})
      })
      await mountSession()
      await act(async () => {})
      expect(hook!.pendingOptionId).toBeNull()
      let mutation: Promise<unknown> | undefined
      await act(async () => {
        mutation = reset
          ? hook!.optionSurface.resetOption?.('model')
          : hook!.setStructuredOption('model', 'sonnet')
        // The rendered picker has not caught up with the write's ref yet.
        expect(hook!.pendingOptionId).toBeNull()
        expect(await bridge.sendWithOutcome('keep this draft')).toBe('rejected')
        expect(await hook!.sendWithOutcome('keep this draft')).toBe('rejected')
      })
      expect(
        sendRequest.mock.calls.filter(([method]) => method === 'agentSession.setOption')
      ).toHaveLength(1)
      expect(calls()).toHaveLength(0)
      expect(hook!.session.messages).toEqual([])
      expect(captureSendOrigin).not.toHaveBeenCalled()
      expect(clearDraftForSend).not.toHaveBeenCalled()
      expect(restoreRejectedDraft).not.toHaveBeenCalled()
      await act(async () => {
        expect(await hook!.sendWithOutcome('still pending')).toBe('rejected')
      })
      await act(async () => {
        current = { model: 'sonnet', ...(reset ? { modelDefault: true } : {}) }
        write.resolve(
          mutationOk({
            key: 'model',
            value: reset ? null : 'sonnet',
            options: { model: 'sonnet' },
            ...(reset ? { modelDefault: true } : {})
          })
        )
        await mutation
        expect(await bridge.sendWithOutcome('fresh send')).toBe('accepted')
      })
      expect(calls()).toHaveLength(1)
      if (takesOptions && !reset) {
        expect(fieldsOf(calls()[0]![1]).options).toEqual({ model: 'sonnet' })
      } else {
        expect(fieldsOf(calls()[0]![1])).not.toHaveProperty('options')
      }
      expect(hook!.session.messages).toHaveLength(1)
      expect(clearDraftForSend).toHaveBeenCalledTimes(1)
    }
  )

  it.each([false, true])(
    'releases a failed model write without changing the selection (reset %s)',
    async (reset) => {
      agent = 'claude'
      hostSupport = structuredAgentSessionHostSupport([
        AGENT_SESSION_DEFAULT_MODEL_CAPABILITY,
        AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY
      ])
      const write = deferred<RpcResponse>()
      sendRequest.mockImplementation(async (method) =>
        method === 'agentSession.setOption'
          ? write.promise
          : method === 'agentSession.send'
            ? sendResult('accepted')
            : method === 'agentSession.options'
              ? ok(MODEL_OPTIONS)
              : method === 'agentSession.conversationCommand'
                ? mutationOk({ command: 'compact', state: 'completed' })
                : ok({})
      )
      await mountSession()
      await act(async () => {})
      await act(async () => {
        const mutation = reset
          ? hook!.optionSurface.resetOption?.('model')
          : hook!.setStructuredOption('model', 'sonnet')
        expect(await hook!.sendWithOutcome('pending')).toBe('rejected')
        expect(await bridge.sendWithOutcome('/compact')).toBe('accepted')
        expect(hook!.isModelWritePending()).toBe(true)
        write.resolve({
          id: 'write',
          ok: false,
          error: { code: 'invalid_argument', message: 'Model unavailable' }
        })
        await mutation
        expect(await hook!.sendWithOutcome('after refusal')).toBe('accepted')
      })
      expect(calls()).toHaveLength(1)
      expect(fieldsOf(calls()[0]![1]).options).toEqual({ model: 'opus' })
    }
  )

  it.each([false, true])(
    'allows an options-capable host to send without a known original model (Default %s)',
    async (modelDefault) => {
      agent = 'claude'
      hostSupport = structuredAgentSessionHostSupport([
        AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY
      ])
      sendRequest.mockImplementation(async (method) =>
        method === 'agentSession.send'
          ? sendResult('accepted')
          : method === 'agentSession.options'
            ? ok({ models: [], current: { modelDefault } })
            : ok({})
      )
      await mountSession()
      await act(async () => {
        expect(await bridge.sendWithOutcome('provider chooses')).toBe('accepted')
      })
      expect(calls()).toHaveLength(1)
      expect(fieldsOf(calls()[0]![1])).not.toHaveProperty('options')
      expect(clearDraftForSend).toHaveBeenCalledTimes(1)
    }
  )

  it('keeps the new session write guarded when the old session write settles', async () => {
    agent = 'claude'
    hostSupport = structuredAgentSessionHostSupport([AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY])
    const oldWrite = deferred<RpcResponse>()
    const newWrite = deferred<RpcResponse>()
    sendRequest.mockImplementation(async (method, params) => {
      if (method === 'agentSession.setOption') {
        return fieldsOf(fieldsOf(params).envelope).sessionId === 'session-1'
          ? oldWrite.promise
          : newWrite.promise
      }
      return method === 'agentSession.send'
        ? sendResult('accepted')
        : method === 'agentSession.options'
          ? ok(MODEL_OPTIONS)
          : ok({})
    })
    await mountSession()
    await act(async () => {})
    let oldMutation: Promise<boolean> | undefined
    act(() => {
      oldMutation = hook!.setStructuredOption('model', 'sonnet')
    })
    sessionId = 'session-2'
    await act(async () => {
      renderer!.update(createElement(Harness))
    })
    const event = snapshotEvent()
    await act(async () => listener?.({ ...event, sessionId, page: { ...event.page, sessionId } }))
    expect(hook!.isModelWritePending()).toBe(false)
    let newMutation: Promise<boolean> | undefined
    act(() => {
      newMutation = hook!.setStructuredOption('model', 'sonnet')
    })
    await act(async () => {
      oldWrite.resolve(mutationOk({ key: 'model', value: 'sonnet', options: { model: 'sonnet' } }))
      await oldMutation
      expect(await hook!.sendWithOutcome('new session still pending')).toBe('rejected')
    })
    expect(calls()).toHaveLength(0)
    expect(hook!.pendingOptionId).toBe('model')
    await act(async () => {
      newWrite.resolve(mutationOk({ key: 'model', value: 'sonnet', options: { model: 'sonnet' } }))
      await newMutation
      expect(await hook!.sendWithOutcome('new session ready')).toBe('accepted')
    })
    expect(calls()[0]![1]).toMatchObject({
      envelope: { sessionId: 'session-2', expectedRuntimeFence: 3 }
    })
  })

  it("sends a command the chat's own agent runs as a message, though Codex's host claims it", async () => {
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.send' ? sendResult('accepted') : ok({ models: [], current: {} })
    )
    agent = 'opencode'
    await mountSession()
    await act(async () => {
      expect(await hook!.sendWithOutcome('/review')).toBe('accepted')
    })
    expect(calls()).toHaveLength(1)
    expect(onSendError).not.toHaveBeenCalled()
  })

  it.each(['unknown', 'pending', 'accepted'] as const)(
    'a later Send owns a new id even when the earlier host answer was %s',
    async (state) => {
      sendRequest.mockImplementation(async (method) =>
        method === 'agentSession.send' ? sendResult(state) : ok({ models: [], current: {} })
      )
      await mountSession()
      await act(async () => {
        const outcome = state === 'unknown' ? 'unknown' : 'accepted'
        expect(await hook!.sendWithOutcome('same text')).toBe(outcome)
        expect(await hook!.sendWithOutcome('same text')).toBe(outcome)
      })
      expect(new Set(sentIds()).size).toBe(2)
    }
  )

  it('shows a recovered unknown once and a new Send and reply without replay', async () => {
    const original = structuredSendResultFixture('unknown')
    if (!('submission' in original)) {
      throw new Error('expected a submission answer')
    }
    original.submission.recovered = true
    const event = snapshotEvent({
      items: [
        {
          itemId: agentJournalSubmissionKey(original.submission.clientMessageId),
          revision: 1,
          sequence: 1,
          observedAt: 10,
          body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'same text' }] }
        }
      ],
      submissions: [original.submission]
    })

    sendRequest.mockImplementation(async (method, params) => {
      if (method !== 'agentSession.send') {
        return ok({ models: [], current: {} })
      }
      const id = String(fieldsOf(fieldsOf(params).envelope).clientOperationId)
      const value = structuredSendResultFixture('accepted')
      if (!('submission' in value)) {
        throw new Error('expected a submission answer')
      }
      value.clientMessageId = id
      value.submission.clientMessageId = id
      return ok({
        ok: true,
        replayed: false,
        fence: 3,
        cursor: { epoch: 'epoch-1', sequence: 2 },
        value
      })
    })
    await mountSession()
    act(() => listener?.(event))
    const messages = hook!.session.messages
    expect(messages).toHaveLength(1)
    expect(messages[0]?.unsent).toBeUndefined()
    expect(hook!.isWorking).toBe(false)
    expect(mobileNativeChatUnsentNotices(event.page, agent).size).toBe(0)
    expect(renderer!.root.findByType('span').children).toEqual([])
    await act(async () => {
      expect(await hook!.sendWithOutcome('same text')).toBe('accepted')
    })
    const sent = agentJournalSubmissionKey(sentIds()[0] ?? '')
    expect(hook!.session.messages.map((message) => message.id)).toEqual([messages[0]?.id, sent])
    expect(hook!.session.messages[0]).toEqual(messages[0])
    const followUp = structuredSendResultFixture('accepted')
    if (!('submission' in followUp)) {
      throw new Error('expected a submission answer')
    }
    const newId = sentIds()[0]!
    expect(newId).not.toBe(original.submission.clientMessageId)
    followUp.submission.clientMessageId = newId
    const reply = snapshotEvent({
      items: [
        ...event.page.items,
        { ...event.page.items[0]!, itemId: sent, sequence: 2, observedAt: 20 },
        {
          itemId: 'assistant-reply',
          revision: 1,
          sequence: 3,
          observedAt: 30,
          body: {
            kind: 'message',
            role: 'assistant',
            blocks: [{ type: 'text', text: 'Reply to the new send' }]
          }
        }
      ],
      submissions: [original.submission, followUp.submission]
    })

    act(() => listener?.(reply))
    expect(hook!.session.messages.map((message) => message.id)).toEqual([
      messages[0]?.id,
      sent,
      'assistant-reply'
    ])
    expect(hook!.session.messages.at(-1)?.blocks).toEqual([
      { type: 'text', text: 'Reply to the new send' }
    ])
    expect(hook!.session.messages[0]).toEqual(messages[0])
    expect(reply.page.submissions[0]).toMatchObject({ dispatchState: 'unknown', recovered: true })
    expect(calls()).toHaveLength(1)
  })

  it.each(['reply-before-row', 'row-before-commit'] as const)(
    'leaves a recorded rejection to its row, with no banner and nothing handed back, for %s',
    async (order) => {
      const fact = { kind: 'notSignedIn' } as const
      const words = agentSessionFailureWords(fact, { agentName: 'Codex', surface: 'row' })
      const value = structuredSendResultFixture('rejected', words.text)
      if (!('submission' in value)) {
        throw new Error('expected submission')
      }
      value.submission.rejection = fact
      const sentRow = agentJournalSubmissionKey(value.submission.clientMessageId)
      const event = snapshotEvent({
        items: [
          {
            itemId: 'auth-row',
            sequence: 1,
            revision: 1,
            observedAt: 1,
            body: { kind: 'status', tone: 'error', ...words }
          },
          {
            itemId: sentRow,
            sequence: 2,
            revision: 1,
            observedAt: 2,
            body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'my message' }] }
          }
        ],
        submissions: [value.submission]
      })

      sendRequest.mockImplementation(async (method) => {
        if (method !== 'agentSession.send') {
          return ok({ models: [], current: {} })
        }
        if (order === 'row-before-commit') {
          listener?.(event)
        }
        return ok({
          ok: true,
          replayed: false,
          fence: 3,
          cursor: { epoch: 'epoch-1', sequence: 1 },
          value
        })
      })
      await mountSession()
      await act(async () => {
        expect(await hook!.sendWithOutcome('my message')).toBe('accepted')
      })
      if (order === 'reply-before-row') {
        act(() => listener?.(event))
      }
      expect(onSendError).not.toHaveBeenCalled()
      expect(renderer!.root.findByType('span').children).toEqual([])
      expect(hook!.session.messages.find((message) => message.id === sentRow)).toMatchObject({
        unsent: true
      })
    }
  )

  it('does not replay an old action after remount', async () => {
    sendRequest.mockImplementation(async (method) => {
      if (method === 'agentSession.send') {
        throw markRpcDeliveryUnknown(new Error('Connection closed'))
      }
      return ok({ models: [], current: {} })
    })
    await mountSession()
    await act(async () => {
      expect(await hook!.sendWithOutcome('survive remount')).toBe('unknown')
    })
    act(() => renderer?.unmount())
    renderer = null
    listener = null
    await mountSession()
    await act(async () => {
      expect(await hook!.sendWithOutcome('survive remount')).toBe('unknown')
    })
    expect(new Set(sentIds()).size).toBe(2)
  })

  it('uses newly uploaded attachment paths for a new action with the same image', async () => {
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.send' ? sendResult('unknown') : ok({ models: [], current: {} })
    )
    await mountSession()
    await act(async () => {
      for (const path of ['/tmp/original.png', '/tmp/reuploaded.png']) {
        expect(
          await hook!.sendWithOutcome('describe', undefined, undefined, [
            {
              path,
              previewUri: 'file:///photo.jpg'
            }
          ])
        ).toBe('unknown')
      }
    })
    expect(new Set(sentIds()).size).toBe(2)
    expect(calls()[1]?.[1]).toMatchObject({
      body: {
        blocks: expect.arrayContaining([{ type: 'image-ref', path: '/tmp/reuploaded.png' }])
      }
    })
  })

  it('sends an attached file as a reference after the text, and only images as image blocks', async () => {
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.send' ? sendResult('accepted') : ok({ models: [], current: {} })
    )
    await mountSession()
    await act(async () => {
      await hook!.sendWithOutcome('read these', undefined, undefined, [
        { path: '/tmp/shot.png', previewUri: 'file:///shot.png' },
        { kind: 'file', path: '/store/u1/spec.pdf' }
      ])
    })
    expect(calls()[0]?.[1]).toMatchObject({
      body: {
        blocks: [
          { type: 'text', text: 'read these\n@/store/u1/spec.pdf' },
          { type: 'image-ref', path: '/tmp/shot.png' }
        ]
      }
    })
  })

  it('reports a send stopped before the agent started it without sending it twice', async () => {
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.send'
        ? sendResult('rejected', DISPATCH_REJECTED_CANCELLED)
        : ok({ models: [], current: {} })
    )
    await mountSession()
    await act(async () => {
      expect(await hook!.sendWithOutcome('stopped')).toBe('accepted')
      expect(await hook!.sendWithOutcome('stopped')).toBe('accepted')
    })
    expect(calls()).toHaveLength(2)
    expect(new Set(sentIds()).size).toBe(2)
    expect(onSendError).not.toHaveBeenCalled()
  })

  it.each(['invalid_argument', 'unauthorized'])(
    'a later Send is independent after a %s refusal',
    async (code) => {
      let attempts = 0
      sendRequest.mockImplementation(async (method) => {
        if (method !== 'agentSession.send') {
          return ok({ models: [], current: {} })
        }
        return ++attempts === 1
          ? {
              id: 'request-1',
              ok: false as const,
              error: { code, message: 'Message is not authorized' }
            }
          : sendResult('accepted')
      })
      await mountSession()
      await act(async () => {
        expect(await hook!.sendWithOutcome('again')).toBe('rejected')
        expect(await hook!.sendWithOutcome('again')).toBe('accepted')
      })
      expect(new Set(sentIds()).size).toBe(2)
    }
  )

  it('a new Send goes through after a stale-fence refusal', async () => {
    let attempts = 0
    sendRequest.mockImplementation(async (method) => {
      if (method !== 'agentSession.send') {
        return ok({ models: [], current: {} })
      }
      return ++attempts === 1
        ? ok({
            ok: false,
            refusal: {
              code: 'agent_session_checkpoint_stale',
              message: 'Fence moved',
              currentFence: 3
            }
          })
        : sendResult('accepted')
    })
    await mountSession()
    await act(async () => {
      expect(await hook!.sendWithOutcome('again')).toBe('rejected')
      expect(await hook!.sendWithOutcome('again')).toBe('accepted')
    })
    expect(new Set(sentIds()).size).toBe(2)
  })

  it('never reads an old phone journal, even when storage is full or unreadable', async () => {
    asyncStorage.getItem.mockRejectedValue(new Error('unreadable old journal'))
    asyncStorage.setItem.mockRejectedValue(new Error('disk full'))
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.send' ? sendResult('accepted') : ok({ models: [], current: {} })
    )
    await mountSession()
    await act(async () => {
      expect(await hook!.sendWithOutcome('new action')).toBe('accepted')
    })
    expect(asyncStorage.getItem).not.toHaveBeenCalled()
    expect(asyncStorage.setItem).not.toHaveBeenCalled()
    expect(onSendError).not.toHaveBeenCalled()
  })

  it('sends nothing once the action budget expires', async () => {
    await mountSession()
    await act(async () => {
      expect(await hook!.sendWithOutcome('never attempted', undefined, 0)).toBe('rejected')
    })
    expect(calls()).toHaveLength(0)
  })
})
