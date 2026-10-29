import './unused-default-rpc-methods.test-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { RpcDispatcher } from './dispatcher'
import { defineMethod, defineStreamingMethod, type RpcRequest } from './core'
import type { OrcaRuntimeService } from '../orca-runtime'
import {
  _resetOrcadFeatureReadinessForTests,
  installOrcadFeatureReadiness,
  ORCAD_FEATURE_WAIT_MS
} from './orcad-feature-readiness'

const request = (method: string): RpcRequest => ({ id: 'r1', authToken: 't', method, params: {} })

function dispatcher(): { dispatcher: RpcDispatcher; ran: string[] } {
  const ran: string[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher reads only these runtime members for plain methods.
  const runtime = {
    getRuntimeId: () => 'rt',
    recordFeatureInteraction: vi.fn()
  } as unknown as OrcaRuntimeService
  const methods = [
    defineMethod({
      name: 'aiVault.searchStatus',
      requires: ['sessionSearch'],
      permission: 'workspace',
      params: z.object({}),
      handler: () => {
        ran.push('searchStatus')
        return { ready: true }
      }
    }),
    defineMethod({
      name: 'status.get',
      permission: 'workspace',
      params: z.object({}),
      handler: () => {
        ran.push('status')
        return {}
      }
    }),
    defineStreamingMethod({
      name: 'accounts.subscribe',
      requires: ['accounts'],
      permission: 'workspace',
      params: z.object({}),
      handler: async (_params, _ctx, emit) => {
        ran.push('subscribe')
        emit({ type: 'ready' })
      }
    })
  ]
  return { dispatcher: new RpcDispatcher({ runtime, methods }), ran }
}

afterEach(() => {
  _resetOrcadFeatureReadinessForTests()
  vi.useRealTimers()
})

describe('RPC methods that require an orcad startup phase', () => {
  it('run at once where no readiness is installed (the desktop)', async () => {
    const { dispatcher: rpc, ran } = dispatcher()
    await expect(rpc.dispatch(request('aiVault.searchStatus'))).resolves.toMatchObject({ ok: true })
    expect(ran).toEqual(['searchStatus'])
  })

  it('wait for their phase, while methods that need none run at once', async () => {
    const readiness = installOrcadFeatureReadiness()
    const { dispatcher: rpc, ran } = dispatcher()
    const search = rpc.dispatch(request('aiVault.searchStatus'))
    await expect(rpc.dispatch(request('status.get'))).resolves.toMatchObject({ ok: true })
    expect(ran).toEqual(['status'])

    readiness.open('sessionSearch')
    await expect(search).resolves.toMatchObject({ ok: true, result: { ready: true } })
    expect(ran).toEqual(['status', 'searchStatus'])
  })

  it('refuse retryably with runtime_unavailable once the bounded wait runs out', async () => {
    vi.useFakeTimers()
    installOrcadFeatureReadiness()
    const { dispatcher: rpc, ran } = dispatcher()
    const search = rpc.dispatch(request('aiVault.searchStatus'))
    await vi.advanceTimersByTimeAsync(ORCAD_FEATURE_WAIT_MS)
    await expect(search).resolves.toMatchObject({
      ok: false,
      error: { code: 'runtime_unavailable' }
    })
    expect(ran).toEqual([])
  })

  it('gate streaming methods the same way', async () => {
    const readiness = installOrcadFeatureReadiness()
    const { dispatcher: rpc, ran } = dispatcher()
    const replies: string[] = []
    const stream = rpc.dispatchStreaming(request('accounts.subscribe'), (reply) =>
      replies.push(reply)
    )
    await Promise.resolve()
    expect(ran).toEqual([])
    readiness.open('accounts')
    await stream
    expect(ran).toEqual(['subscribe'])
    expect(replies).toHaveLength(1)
  })
})
