import { createElement } from 'react'
import { act, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, vi } from 'vitest'
import { createWithQueryClient } from '../test-support/query-client-test-renderer'
import { stubRpcClient } from '../transport/rpc/rpc-client-test-stub'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { useMobileStructuredAgentSession } from './use-mobile-structured-agent-session'
import { useMobileStructuredNativeChatSendBridge } from './use-mobile-structured-native-chat-send-bridge'
import { structuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import { snapshotEvent } from './native-chat/agent-session/use-mobile-structured-agent-session-queued.test-fixture'
import { defineMobilePendingModelSendCases } from './mobile-pending-model-send.test-fixture'
import { mobileNativeChatDraftDestination } from './native-chat/composer/mobile-native-chat-draft-inputs'
import { resetMobileNativeChatDraftStoreForTests } from './native-chat/composer/mobile-native-chat-draft-store'
import type { MobileNativeChatSendOrigin } from './native-chat/mobile-native-chat-pending-echo'

const storage = vi.hoisted(() => new Map<string, string>())
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: async (key: string) => {
      storage.delete(key)
    }
  }
}))

let renderer: ReactTestRenderer | null = null
let hook: ReturnType<typeof useMobileStructuredAgentSession> | null = null
let bridge: ReturnType<typeof useMobileStructuredNativeChatSendBridge> | null = null
let listener: ((value: unknown) => void) | null = null
let agent = 'claude'
let hostSupport = structuredAgentSessionHostSupport([])
const sendRequest = vi.fn<RpcClient['sendRequest']>()
const onSendError = vi.fn()
const captureSendOrigin = vi.fn((text: string): MobileNativeChatSendOrigin => ({
  draftKey: 'draft',
  draftDestination: mobileNativeChatDraftDestination('draft'),
  draftEditGeneration: 0,
  pendingKey: 'pending',
  normalizedText: text,
  boundary: { afterMessageId: null },
  sentAt: 0
}))
const clearDraftForSend = vi.fn()
const restoreRejectedDraft = vi.fn()
const client = stubRpcClient({
  sendRequest,
  subscribe: (method, _params, receive) => {
    if (method === 'agentSession.subscribe') {
      listener = receive
    }
    return () => {}
  }
})

function Harness(): null {
  hook = useMobileStructuredAgentSession({
    client,
    pairedHostClient: client,
    sessionId: 'session-1',
    sourceIdentity: 'host-a\0workspace-a',
    enabled: true,
    connected: true,
    hostSupport,
    agent,
    onSendError
  })
  bridge = useMobileStructuredNativeChatSendBridge({
    agent: 'claude',
    sendStructured: hook.sendWithOutcome,
    isModelWritePending: hook.isModelWritePending,
    captureSendOrigin,
    clearDraftForSend,
    restoreRejectedDraft,
    holdUnconfirmed: hook.holdUnconfirmed,
    onSendError
  })
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  storage.clear()
  listener = null
  resetMobileNativeChatDraftStoreForTests()
})
afterEach(async () => {
  await act(async () => renderer?.unmount())
  renderer = null
  hook = null
  bridge = null
})

defineMobilePendingModelSendCases({
  setAgent: (value) => {
    agent = value
  },
  setHostSupport: (value) => {
    hostSupport = value
  },
  getHook: () => {
    if (!hook) {
      throw new Error('Session not mounted')
    }
    return hook
  },
  getBridge: () => {
    if (!bridge) {
      throw new Error('Bridge not mounted')
    }
    return bridge
  },
  sendRequest,
  calls: () => sendRequest.mock.calls.filter(([method]) => method === 'agentSession.send'),
  mountSession: async () => {
    await act(async () => {
      renderer = createWithQueryClient(createElement(Harness))
    })
    const receive = listener
    if (!receive) {
      throw new Error('Session subscription missing')
    }
    await act(async () => receive(snapshotEvent()))
  },
  captureSendOrigin,
  clearDraftForSend,
  restoreRejectedDraft
})
