import { act } from 'react-test-renderer'
import { expect, it, type Mock } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { useMobileStructuredAgentSession } from './use-mobile-structured-agent-session'
import { DISPATCH_REJECTED_CANCELLED } from '../../../src/shared/structured-agent-session-dispatch-rejection'
import { sendResult } from './structured-session-send-options.test-fixture'
import { ok } from './use-mobile-structured-agent-session-queued.test-fixture'

export function defineMobileSendRefusalCases({
  getHook,
  sendRequest,
  mountSession,
  calls,
  sentIds,
  onSendError
}: {
  getHook: () => ReturnType<typeof useMobileStructuredAgentSession>
  sendRequest: Mock<RpcClient['sendRequest']>
  mountSession: () => Promise<void>
  calls: () => Parameters<RpcClient['sendRequest']>[]
  sentIds: () => string[]
  onSendError: unknown
}): void {
  it('reports a send stopped before the agent started it without sending it twice', async () => {
    sendRequest.mockImplementation(async (method) =>
      method === 'agentSession.send'
        ? sendResult('rejected', DISPATCH_REJECTED_CANCELLED)
        : ok({ models: [], current: {} })
    )
    await mountSession()
    await act(async () => {
      expect(await getHook().sendWithOutcome('stopped')).toBe('accepted')
      expect(await getHook().sendWithOutcome('stopped')).toBe('accepted')
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
        expect(await getHook().sendWithOutcome('again')).toBe('rejected')
        expect(await getHook().sendWithOutcome('again')).toBe('accepted')
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
      expect(await getHook().sendWithOutcome('again')).toBe('rejected')
      expect(await getHook().sendWithOutcome('again')).toBe('accepted')
    })
    expect(new Set(sentIds()).size).toBe(2)
  })

  it('sends nothing once the action budget expires', async () => {
    await mountSession()
    await act(async () => {
      expect(await getHook().sendWithOutcome('never attempted', undefined, 0)).toBe('rejected')
    })
    expect(calls()).toHaveLength(0)
  })
}
