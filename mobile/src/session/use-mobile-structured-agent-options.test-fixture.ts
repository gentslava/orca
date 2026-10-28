import { createElement, useLayoutEffect } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { vi } from 'vitest'
import type {
  AgentSessionModelCatalogResult,
  AgentSessionOptionResult,
  AgentSessionOptionsResult
} from '../../../src/shared/agent-session-wire'
import type { SessionOptionDescriptor } from '../../../src/shared/native-chat/input/native-chat-session-options'
import type { RpcClient } from '../transport/rpc-client'
import type {
  StructuredAgentSessionMutate,
  StructuredAgentSessionMutationResult
} from './mobile-structured-agent-session-rpc'
import { useMobileStructuredAgentOptions } from './use-mobile-structured-agent-options'

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function rpcSuccess(result: unknown) {
  return { id: 'rpc-1', ok: true as const, result, _meta: { runtimeId: 'runtime-1' } }
}

type SentRequest = { method: string; params: unknown }

export function optionsClient(
  reads: () => Promise<AgentSessionOptionsResult>,
  catalog?: (params: unknown) => Promise<AgentSessionModelCatalogResult>
) {
  const sent: SentRequest[] = []
  const client: RpcClient = {
    sendRequest: async (method: string, params?: unknown) => {
      sent.push({ method, params })
      if (method === 'agentSession.modelCatalog') {
        // Without a scripted catalog, the host predates the method.
        return catalog
          ? rpcSuccess(await catalog(params))
          : {
              id: 'rpc-1',
              ok: false as const,
              error: { code: 'method_not_found', message: 'Unknown method' },
              _meta: { runtimeId: 'runtime-1' }
            }
      }
      return rpcSuccess(method === 'agentSession.options' ? await reads() : {})
    },
    subscribe: () => () => {},
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
  const methods = (name: string) => sent.filter((entry) => entry.method === name)
  return { client, sent, methods, optionReads: () => methods('agentSession.options').length }
}

export function queuedReads(...results: AgentSessionOptionsResult[]) {
  let index = 0
  return () => Promise.resolve(results[Math.min(index++, results.length - 1)]!)
}

type MutateCall = { method: string; fields: Record<string, unknown> }

// Use an untyped mock: a concrete fixture cannot satisfy arbitrary TValue from the generic mutation caller.
export function recordingMutate(
  next: (call: number) => Promise<StructuredAgentSessionMutationResult<AgentSessionOptionResult>>
) {
  const calls: MutateCall[] = []
  const mock = vi.fn()
  mock.mockImplementation(
    (method: string, _fingerprintMethod: string, fields: Record<string, unknown>) => {
      calls.push({ method, fields })
      return next(calls.length - 1)
    }
  )
  const mutate: StructuredAgentSessionMutate = mock
  return { calls, mutate }
}

export function accepted(
  value: AgentSessionOptionResult,
  sameFence: boolean
): StructuredAgentSessionMutationResult<AgentSessionOptionResult> {
  return { status: 'accepted', value, sameFence }
}

export type Controller = ReturnType<typeof useMobileStructuredAgentOptions>

type ProbeProps = {
  agent: string | null
  client: RpcClient | null
  sessionId: string | null
  fence: number | null
  mutate: StructuredAgentSessionMutate
  optionStamp?: string
  supportsDefault?: boolean
  turnId?: string | null
  onRender: (controller: Controller) => void
}

function Probe(props: ProbeProps): null {
  const controller = useMobileStructuredAgentOptions({
    agent: props.agent,
    client: props.client,
    sessionId: props.sessionId,
    enabled: true,
    fence: props.fence,
    mutate: props.mutate,
    turnId: props.turnId ?? null,
    ...(props.optionStamp ? { optionStamp: props.optionStamp } : {}),
    hostSupport: { permissionModes: true, statusFeed: false, defaultModel: props.supportsDefault }
  })
  useLayoutEffect(() => props.onRender(controller), [controller, props.onRender])
  return null
}

export async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

export async function mountOptions(props: Omit<ProbeProps, 'onRender'>) {
  let rendered: Controller | null = null
  const onRender = (controller: Controller) => {
    rendered = controller
  }
  let renderer: ReactTestRenderer | null = null
  await act(async () => {
    renderer = create(createElement(Probe, { ...props, onRender }))
  })
  await settle()
  const current = (): Controller => {
    if (!rendered) {
      throw new Error('probe never rendered')
    }
    return rendered
  }
  return {
    current,
    rerender: async (next: Partial<Omit<ProbeProps, 'onRender'>>) => {
      await act(async () => {
        renderer?.update(createElement(Probe, { ...props, ...next, onRender }))
      })
      await settle()
    },
    unmount: async () => {
      await act(async () => renderer?.unmount())
    }
  }
}

export function descriptorFor(
  snapshot: readonly SessionOptionDescriptor[],
  id: string
): SessionOptionDescriptor | undefined {
  return snapshot.find((entry) => entry.id === id)
}

export function currentValueOf(snapshot: readonly SessionOptionDescriptor[], id: string) {
  const kind = descriptorFor(snapshot, id)?.kind
  return kind && 'currentValue' in kind ? kind.currentValue : undefined
}

export const BASE = { agent: 'codex', sessionId: 'session-1', fence: 1 } as const

export const SEND_MODEL_OPTIONS: AgentSessionOptionsResult = {
  conversationCommands: ['compact'],
  models: [
    { id: 'opus', label: 'Opus', isDefault: true, efforts: [] },
    { id: 'sonnet', label: 'Sonnet', isDefault: false, efforts: [] }
  ],
  current: { model: 'opus' }
}
