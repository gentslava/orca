import { act } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type {
  AgentSessionModelCatalogResult,
  AgentSessionOptionResult,
  AgentSessionOptionsResult
} from '../../../src/shared/agent-session-wire'
import type { PersistedNativeChatSessionOptions } from '../../../src/shared/native-chat/input/native-chat-session-options'
import type { StructuredAgentSessionMutationResult } from './mobile-structured-agent-session-rpc'
import {
  accepted,
  BASE,
  currentValueOf,
  deferred,
  descriptorFor,
  mountOptions,
  optionsClient,
  queuedReads,
  recordingMutate,
  settle,
  type Controller
} from './use-mobile-structured-agent-options.test-fixture'
import { rememberMobileCreatedStructuredSession } from './mobile-created-structured-sessions'
import {
  applyNativeChatSessionOptionSettingsMutation,
  resolveStructuredLaunchSeedOptions
} from '../../../src/shared/native-chat/input/native-chat-session-option-defaults'
import { NativeChatSessionOptionsMutation } from '../../../src/shared/rpc-contract/client-settings-params'

import { OPTIONS, FAST_OPTIONS, FAST_OPTIONS_ON } from './mobile-structured-agent-option-test-data'

describe('useMobileStructuredAgentOptions Default model', () => {
  it.each([false, true])(
    'serializes Default reset with dependent option writes (reset first: %s)',
    async (resetFirst) => {
      let reads = 0
      const client = optionsClient(() =>
        ++reads === 1 ? Promise.resolve(OPTIONS) : new Promise(() => {})
      )
      const inFlight = deferred<StructuredAgentSessionMutationResult<AgentSessionOptionResult>>()
      const mutation = recordingMutate(() => inFlight.promise)
      const mounted = await mountOptions({
        ...BASE,
        client: client.client,
        mutate: mutation.mutate,
        supportsDefault: true
      })
      let first: Promise<unknown> | undefined
      await act(async () => {
        first = resetFirst
          ? mounted.current().optionSurface.resetOption?.('model')
          : mounted.current().setStructuredOption('effort', 'medium')
        if (resetFirst) {
          expect(await mounted.current().setStructuredOption('effort', 'medium')).toBe(false)
          expect(mounted.current().isModelWritePending()).toBe(true)
        } else {
          await mounted.current().optionSurface.resetOption?.('model')
        }
      })
      expect(mutation.calls).toHaveLength(1)
      expect(mutation.calls[0]?.fields).toEqual(
        resetFirst ? { key: 'model', value: null } : { key: 'effort', value: 'medium' }
      )
      await act(async () => {
        inFlight.resolve(
          accepted(
            resetFirst
              ? {
                  key: 'model',
                  value: null,
                  modelDefault: true,
                  options: { model: 'gpt-fast', effort: 'low' }
                }
              : { key: 'effort', value: 'medium', options: { effort: 'medium' } },
            true
          )
        )
        await first
      })
      expect(mounted.current().pendingOptionId).toBeNull()
      expect(mounted.current().isModelWritePending()).toBe(false)
      expect(currentValueOf(mounted.current().optionSnapshot, 'effort')).toBe(
        resetFirst ? 'low' : 'medium'
      )
      await mounted.unmount()
    }
  )
  it.each([false, true])(
    'keeps Default across effort-only persistence until an explicit model pick (full reply: %s)',
    async (fullReply) => {
      let persisted: PersistedNativeChatSessionOptions = {
        codex: { model: 'gpt-live', valuesByModel: {} }
      }
      let reads = 0
      const client = optionsClient(() =>
        ++reads === 1 ? Promise.resolve(OPTIONS) : new Promise(() => {})
      )
      const request = client.client.sendRequest
      client.client.sendRequest = async (method, params) => {
        if (method === 'settings.mutateNativeChatSessionOptions') {
          persisted =
            applyNativeChatSessionOptionSettingsMutation(
              persisted,
              NativeChatSessionOptionsMutation.parse(params)
            ) ?? persisted
        }
        return request(method, params)
      }
      const mutation = recordingMutate(async (call) =>
        accepted(
          call === 0
            ? {
                key: 'model',
                value: null,
                modelDefault: true,
                options: { model: 'gpt-fast', effort: 'low' }
              }
            : {
                key: call === 3 ? 'model' : 'effort',
                value: call === 3 ? 'gpt-fast' : call === 1 ? 'medium' : 'low',
                options: {
                  ...(fullReply || call === 3 ? { model: 'gpt-fast' } : {}),
                  effort: call === 2 ? 'low' : 'medium'
                }
              },
          true
        )
      )
      const mounted = await mountOptions({
        ...BASE,
        client: client.client,
        mutate: mutation.mutate,
        supportsDefault: true
      })
      await act(async () => {
        await mounted.current().optionSurface.resetOption?.('model')
      })
      expect(resolveStructuredLaunchSeedOptions(persisted, 'codex')).toBeUndefined()
      for (const effort of ['medium', 'low']) {
        await act(async () => {
          expect(await mounted.current().setStructuredOption('effort', effort)).toBe(true)
        })
        expect(persisted.codex?.valuesByModel?.['gpt-fast']?.effort).toBe(effort)
        expect(resolveStructuredLaunchSeedOptions(persisted, 'codex')).toBeUndefined()
        expect(
          descriptorFor(mounted.current().optionSnapshot, 'model')?.defaultChoice?.selected
        ).toBe(true)
      }
      await act(async () => {
        expect(await mounted.current().setStructuredOption('model', 'gpt-fast')).toBe(true)
      })
      expect(resolveStructuredLaunchSeedOptions(persisted, 'codex')).toEqual({
        model: 'gpt-fast',
        effort: 'medium'
      })
      expect(
        descriptorFor(mounted.current().optionSnapshot, 'model')?.defaultChoice?.selected
      ).toBe(false)
      await mounted.unmount()
    }
  )
  it('carries the host Default preview without replacing the explicit selected model', async () => {
    let reported = true
    const client = optionsClient(async () => ({
      ...OPTIONS,
      ...(reported
        ? {
            defaultModel: {
              id: 'host-original',
              label: 'Host original',
              description: 'Configured model'
            }
          }
        : {})
    }))
    const mounted = await mountOptions({
      ...BASE,
      client: client.client,
      mutate: recordingMutate(async () => accepted({ key: 'model', value: 'gpt-live' }, true))
        .mutate,
      supportsDefault: true
    })
    expect(descriptorFor(mounted.current().optionSnapshot, 'model')?.defaultChoice).toEqual({
      selected: false,
      model: { value: 'host-original', label: 'Host original', description: 'Configured model' }
    })
    expect(currentValueOf(mounted.current().optionSnapshot, 'model')).toBe('gpt-live')
    reported = false
    await mounted.rerender({ optionStamp: 'next-turn' })
    expect(descriptorFor(mounted.current().optionSnapshot, 'model')?.defaultChoice).toEqual({
      selected: false
    })
    await mounted.unmount()
  })
  it.each([false, true])(
    'gates reset on the connected host capability (%s)',
    async (supportsDefault) => {
      let reset = false
      const client = optionsClient(() =>
        Promise.resolve({
          ...OPTIONS,
          current: reset
            ? { model: 'gpt-fast', effort: 'low', modelDefault: true }
            : OPTIONS.current
        })
      )
      const mutation = recordingMutate(async () => {
        reset = true
        return accepted(
          {
            key: 'model',
            value: null,
            modelDefault: true,
            options: { model: 'gpt-fast', effort: 'low' }
          },
          true
        )
      })
      const mounted = await mountOptions({
        agent: 'codex',
        client: client.client,
        sessionId: 'default-phone',
        fence: 1,
        mutate: mutation.mutate,
        supportsDefault
      })
      if (supportsDefault) {
        await act(async () => {
          await mounted.current().optionSurface.resetOption?.('model')
        })
        expect(mutation.calls).toHaveLength(1)
        expect(mutation.calls[0]?.fields).toEqual({ key: 'model', value: null })
        expect(
          mounted.current().optionSnapshot.find((row) => row.id === 'model')?.defaultChoice
            ?.selected
        ).toBe(true)
        expect(client.methods('settings.mutateNativeChatSessionOptions')[0]?.params).toMatchObject({
          type: 'clear-model',
          agent: 'codex'
        })
      } else {
        expect(mounted.current().optionSurface.resetOption).toBeUndefined()
        expect(
          mounted.current().optionSnapshot.find((row) => row.id === 'model')?.defaultChoice
        ).toBeUndefined()
        expect(mutation.calls).toHaveLength(0)
      }
      await mounted.unmount()
    }
  )
})

describe('useMobileStructuredAgentOptions fast mode', () => {
  it('round-trips a boolean fastMode pick as the wire string and remembers the decoded pick', async () => {
    const client = optionsClient(queuedReads(FAST_OPTIONS, FAST_OPTIONS_ON))
    const { calls, mutate } = recordingMutate(async () =>
      accepted(
        { key: 'fastMode', value: 'true', options: { model: 'gpt-live', fastMode: 'true' } },
        true
      )
    )
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })

    expect(currentValueOf(harness.current().optionSnapshot, 'fastMode')).toBe(false)

    let outcome: boolean | null = null
    await act(async () => {
      outcome = await harness.current().setStructuredOption('fastMode', true)
    })
    await settle()

    expect(outcome).toBe(true)
    expect(calls).toEqual([
      { method: 'agentSession.setOption', fields: { key: 'fastMode', value: 'true' } }
    ])
    expect(currentValueOf(harness.current().optionSnapshot, 'fastMode')).toBe(true)

    const persisted = client.methods('settings.mutateNativeChatSessionOptions')
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.params).toMatchObject({
      type: 'apply-picks',
      agent: 'codex',
      picks: expect.arrayContaining([{ modelId: 'gpt-live', optionId: 'fastMode', value: true }])
    })
    await harness.unmount()
  })

  it('offers no Fast row when the provider catalog never claimed support', async () => {
    const client = optionsClient(queuedReads(OPTIONS))
    const { calls, mutate } = recordingMutate(async () =>
      accepted({ key: 'fastMode', value: 'true' }, true)
    )
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })

    expect(descriptorFor(harness.current().optionSnapshot, 'model')).toBeDefined()
    expect(descriptorFor(harness.current().optionSnapshot, 'fastMode')).toBeUndefined()

    let outcome: boolean | null = null
    await act(async () => {
      outcome = await harness.current().setStructuredOption('fastMode', true)
    })
    expect(outcome).toBe(true)
    expect(calls).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ key: 'fastMode', value: 'true' })
      })
    ])
    await harness.unmount()
  })

  it('offers no Fast row when the session reports fast mode unsupported', async () => {
    const client = optionsClient(
      queuedReads({ ...FAST_OPTIONS, fastModeSupport: { supported: false, reason: 'account' } })
    )
    const { mutate } = recordingMutate(async () => ({ status: 'rejected' }))
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })

    expect(descriptorFor(harness.current().optionSnapshot, 'fastMode')).toBeUndefined()
    await harness.unmount()
  })

  it('offers no Fast row when the model capability is unknown', async () => {
    const client = optionsClient(
      queuedReads({
        ...FAST_OPTIONS,
        models: OPTIONS.models
      })
    )
    const { mutate } = recordingMutate(async () => ({ status: 'rejected' }))
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })

    expect(descriptorFor(harness.current().optionSnapshot, 'fastMode')).toBeUndefined()
    await harness.unmount()
  })
})

describe('useMobileStructuredAgentOptions post-write refresh', () => {
  it('reads options back after an accepted same-fence write and applies the refreshed value', async () => {
    const client = optionsClient(queuedReads(FAST_OPTIONS, FAST_OPTIONS_ON))
    const { mutate } = recordingMutate(async () =>
      accepted({ key: 'fastMode', value: 'true', options: {} }, true)
    )
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })

    expect(client.optionReads()).toBe(1)
    expect(currentValueOf(harness.current().optionSnapshot, 'fastMode')).toBe(false)

    await act(async () => {
      await harness.current().setStructuredOption('fastMode', true)
    })
    await settle()

    expect(client.optionReads()).toBe(2)
    expect(currentValueOf(harness.current().optionSnapshot, 'fastMode')).toBe(true)
    await harness.unmount()
  })

  it('skips the refresh when the write landed against a different fence', async () => {
    const client = optionsClient(queuedReads(FAST_OPTIONS, FAST_OPTIONS_ON))
    const { mutate } = recordingMutate(async () =>
      accepted({ key: 'fastMode', value: 'true', options: {} }, false)
    )
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })

    await act(async () => {
      await harness.current().setStructuredOption('fastMode', true)
    })
    await settle()

    expect(client.optionReads()).toBe(1)
    expect(currentValueOf(harness.current().optionSnapshot, 'fastMode')).toBe(false)
    await harness.unmount()
  })
})

describe('useMobileStructuredAgentOptions reads', () => {
  it('re-reads the options each turn, as desktop does', async () => {
    const client = optionsClient(queuedReads(OPTIONS))
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })
    expect(client.optionReads()).toBe(1)
    await harness.rerender({ turnId: 'turn-1' })
    expect(client.optionReads()).toBe(2)
    await harness.unmount()
  })
})

describe('useMobileStructuredAgentOptions generation fencing', () => {
  it('drops an options read a later write superseded', async () => {
    const stale = deferred<AgentSessionOptionsResult>()
    const first = optionsClient(queuedReads(FAST_OPTIONS))
    // Reconnect replaces the client without staling the retained record; generation must fence its prior read.
    let reads = 0
    const reconnected = optionsClient(() =>
      reads++ === 0
        ? stale.promise
        : Promise.resolve({
            ...FAST_OPTIONS,
            current: { ...FAST_OPTIONS.current, model: 'gpt-fast' }
          })
    )
    const { mutate } = recordingMutate(async () =>
      accepted({ key: 'model', value: 'gpt-fast', options: { model: 'gpt-fast' } }, true)
    )
    const harness = await mountOptions({ ...BASE, client: first.client, mutate })

    expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBe('gpt-live')
    await harness.rerender({ client: reconnected.client })
    expect(reconnected.optionReads()).toBe(1)

    let outcome: boolean | null = null
    await act(async () => {
      outcome = await harness.current().setStructuredOption('model', 'gpt-fast')
    })
    await settle()
    expect(outcome).toBe(true)
    expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBe('gpt-fast')

    await act(async () => {
      stale.resolve({ ...FAST_OPTIONS, conversationCommands: ['compact'] })
    })
    await settle()

    expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBe('gpt-fast')
    expect(harness.current().conversationCommands).toEqual([])
    await harness.unmount()
  })
})

describe('useMobileStructuredAgentOptions images', () => {
  it.each([
    ['claude', undefined, true],
    ['grok', undefined, false],
    ['claude', false, false],
    ['grok', true, true]
  ] as const)('offers %s images when its report says %s', async (agent, reported, offered) => {
    const report = reported === undefined ? OPTIONS : { ...OPTIONS, acceptsImages: reported }
    const client = optionsClient(queuedReads(report))
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const harness = await mountOptions({ ...BASE, agent, client: client.client, mutate })
    expect(client.optionReads()).toBe(1)
    expect(harness.current().acceptsImages).toBe(offered)
    await harness.unmount()
  })

  it('keeps the answer through a pick made during the read', async () => {
    const stale = deferred<AgentSessionOptionsResult>()
    const first = optionsClient(queuedReads(OPTIONS))
    const reconnected = optionsClient(() => stale.promise)
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const harness = await mountOptions({ ...BASE, agent: 'opencode', client: first.client, mutate })
    await harness.rerender({ client: reconnected.client })
    await act(async () => {
      await harness.current().setStructuredOption('model', 'gpt-fast')
    })
    expect(harness.current().acceptsImages).toBe(false)
    await act(async () => {
      stale.resolve({ ...OPTIONS, acceptsImages: true })
    })
    await settle()
    expect(harness.current().acceptsImages).toBe(true)
    await harness.unmount()
  })

  it("never shows one chat's answer on the next while its read is in flight", async () => {
    const next = deferred<AgentSessionOptionsResult>()
    let reads = 0
    const client = optionsClient(() =>
      reads++ === 0 ? Promise.resolve({ ...OPTIONS, acceptsImages: true }) : next.promise
    )
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const harness = await mountOptions({ ...BASE, agent: 'grok', client: client.client, mutate })
    expect(harness.current().acceptsImages).toBe(true)
    await harness.rerender({ sessionId: 'session-2' })
    expect(harness.current().acceptsImages).toBe(false)
    await harness.unmount()
  })
})

describe('useMobileStructuredAgentOptions pending picks', () => {
  it('holds a repeat of an option on its way but lets another option go, as desktop does', async () => {
    const client = optionsClient(queuedReads(FAST_OPTIONS, FAST_OPTIONS_ON))
    const inFlight = deferred<StructuredAgentSessionMutationResult<AgentSessionOptionResult>>()
    const { calls, mutate } = recordingMutate(async (call) =>
      call === 0 ? inFlight.promise : accepted({ key: 'fastMode', value: 'true' }, false)
    )
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })

    let firstWrite: Promise<boolean> | null = null
    await act(async () => {
      firstWrite = harness.current().setStructuredOption('effort', 'high')
    })
    expect(calls).toHaveLength(1)
    expect(harness.current().pendingOptionId).toBe('effort')

    let repeat: boolean | null = null
    await act(async () => {
      repeat = await harness.current().setStructuredOption('effort', 'medium')
    })
    expect(repeat).toBe(false)
    expect(calls).toHaveLength(1)

    let other: boolean | null = null
    await act(async () => {
      other = await harness.current().setStructuredOption('fastMode', true)
    })
    expect(other).toBe(true)
    expect(calls).toHaveLength(2)

    await act(async () => {
      inFlight.resolve(accepted({ key: 'effort', value: 'high' }, false))
      await firstWrite
    })
    await settle()
    expect(await firstWrite).toBe(true)
    expect(harness.current().pendingOptionId).toBeNull()
    await harness.unmount()
  })
})

describe('useMobileStructuredAgentOptions for every agent', () => {
  it('reads and picks for an agent with no built-in list, as the desktop does', async () => {
    const client = optionsClient(queuedReads(OPTIONS))
    const { calls, mutate } = recordingMutate(async () =>
      accepted({ key: 'model', value: 'gpt-fast', options: { model: 'gpt-fast' } }, true)
    )
    const harness = await mountOptions({ ...BASE, agent: 'grok', client: client.client, mutate })

    expect(client.optionReads()).toBe(1)
    expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBe('gpt-live')
    await act(async () => {
      await harness.current().setStructuredOption('model', 'gpt-fast')
    })
    await settle()
    expect(calls).toEqual([
      { method: 'agentSession.setOption', fields: { key: 'model', value: 'gpt-fast' } }
    ])
    expect(client.methods('settings.mutateNativeChatSessionOptions')[0]?.params).toMatchObject({
      agent: 'grok'
    })
    await harness.unmount()
  })
})

describe('useMobileStructuredAgentOptions host catalog', () => {
  const HOST_CATALOG: AgentSessionModelCatalogResult = {
    origin: 'probe',
    models: [
      {
        id: 'grok-4',
        label: 'Grok 4',
        isDefault: true,
        defaultEffort: 'high',
        efforts: [
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' }
        ]
      }
    ],
    fetchedAt: 1,
    listingNamesConfiguredModel: true
  }

  it('lists the host’s models while the session’s own options read is still waiting', async () => {
    const pending = deferred<AgentSessionOptionsResult>()
    const client = optionsClient(
      () => pending.promise,
      async () => HOST_CATALOG
    )
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const harness = await mountOptions({ ...BASE, agent: 'grok', client: client.client, mutate })

    expect(client.methods('agentSession.modelCatalog')[0]?.params).toEqual({
      agent: 'grok',
      sessionId: 'session-1'
    })
    const model = descriptorFor(harness.current().optionSnapshot, 'model')
    expect(model?.kind.type === 'select' && model.kind.choices.map((c) => c.value)).toEqual([
      'grok-4'
    ])
    expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBeUndefined()

    pending.resolve({ ...OPTIONS, current: { model: 'gpt-live', confirmed: ['model'] } })
    await settle()
    expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBe('gpt-live')
    await harness.unmount()
  })

  it.each(['grok', 'codex'])(
    'names the configured model and its effort for a %s chat this phone created',
    async (agent) => {
      const sessionId = `${agent}-created-here`
      rememberMobileCreatedStructuredSession(sessionId, 'id:wt-1')
      const client = optionsClient(
        () => deferred<AgentSessionOptionsResult>().promise,
        async () => HOST_CATALOG
      )
      const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
      const harness = await mountOptions({
        ...BASE,
        agent,
        sessionId,
        client: client.client,
        mutate
      })

      expect(client.methods('agentSession.modelCatalog')[0]?.params).toEqual({
        agent,
        sessionId,
        worktree: 'id:wt-1'
      })
      expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBe('grok-4')
      expect(currentValueOf(harness.current().optionSnapshot, 'effort')).toBe('high')
      await harness.unmount()
    }
  )

  it('does not name the listed default when a chat this phone created is reopened', async () => {
    const sessionId = 'grok-reopened'
    rememberMobileCreatedStructuredSession(sessionId, 'id:wt-1')
    const live = { ...OPTIONS, current: { model: 'gpt-fast', confirmed: ['model'] } }
    const first = optionsClient(
      () => Promise.resolve(live),
      async () => HOST_CATALOG
    )
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const opened = await mountOptions({
      ...BASE,
      agent: 'grok',
      sessionId,
      client: first.client,
      mutate
    })
    await settle()
    await opened.unmount()

    const pending = deferred<AgentSessionOptionsResult>()
    const second = optionsClient(
      () => pending.promise,
      async () => HOST_CATALOG
    )
    const reopened = await mountOptions({
      ...BASE,
      agent: 'grok',
      sessionId,
      client: second.client,
      mutate
    })
    await settle()

    expect(second.methods('agentSession.modelCatalog')[0]?.params).toEqual({
      agent: 'grok',
      sessionId
    })
    expect(currentValueOf(reopened.current().optionSnapshot, 'model')).toBeUndefined()
    pending.resolve(live)
    await settle()
    expect(currentValueOf(reopened.current().optionSnapshot, 'model')).toBe('gpt-fast')
    await reopened.unmount()
  })

  it('waits once for the host’s first listing of the account', async () => {
    const catalog = vi.fn(async (params: unknown): Promise<AgentSessionModelCatalogResult> =>
      typeof params === 'object' && params !== null && 'waitForListing' in params
        ? HOST_CATALOG
        : { origin: 'unknown', listingInProgress: true }
    )
    const client = optionsClient(() => deferred<AgentSessionOptionsResult>().promise, catalog)
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const harness = await mountOptions({ ...BASE, agent: 'grok', client: client.client, mutate })
    await settle()

    expect(catalog).toHaveBeenCalledTimes(2)
    const model = descriptorFor(harness.current().optionSnapshot, 'model')
    expect(model?.kind.type === 'select' && model.kind.choices.map((c) => c.value)).toEqual([
      'grok-4'
    ])
    await harness.unmount()
  })

  it('keeps a cold Codex picker usable on the built-in list and lands the listing in place', async () => {
    const listed = deferred<AgentSessionModelCatalogResult>()
    const catalog = vi.fn(async (params: unknown): Promise<AgentSessionModelCatalogResult> =>
      typeof params === 'object' && params !== null && 'waitForListing' in params
        ? listed.promise
        : { origin: 'unknown', listingInProgress: true }
    )
    const client = optionsClient(() => deferred<AgentSessionOptionsResult>().promise, catalog)
    const { calls, mutate } = recordingMutate(async () =>
      accepted({ key: 'model', value: '' }, true)
    )
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })
    await settle()

    const seeded = descriptorFor(harness.current().optionSnapshot, 'model')
    expect(seeded?.settable).toBe(true)
    const seedChoices = seeded?.kind.type === 'select' ? seeded.kind.choices : []
    expect(seedChoices.length).toBeGreaterThan(0)
    await act(async () => {
      await harness.current().setStructuredOption('model', seedChoices[0]!.value)
    })
    expect(calls).toHaveLength(1)

    listed.resolve(HOST_CATALOG)
    await settle()
    const model = descriptorFor(harness.current().optionSnapshot, 'model')
    expect(model?.kind.type === 'select' && model.kind.choices.map((c) => c.value)).toEqual([
      'grok-4',
      seedChoices[0]!.value
    ])
    expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBe(seedChoices[0]!.value)
    await harness.unmount()
  })

  it('keeps the provider-default pill when an older host has no catalog method', async () => {
    const client = optionsClient(() => deferred<AgentSessionOptionsResult>().promise)
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const harness = await mountOptions({ ...BASE, agent: 'grok', client: client.client, mutate })

    expect(descriptorFor(harness.current().optionSnapshot, 'model')).toMatchObject({
      settable: false,
      valueSource: 'unknown'
    })
    await harness.unmount()
  })
})

describe('useMobileStructuredAgentOptions after a lost pick reply', () => {
  const tiers = (value: string, label: string) => [{ value, label }]
  const answer = (model: string, serviceTier: string): AgentSessionOptionsResult => ({
    models: [
      {
        id: 'm1',
        label: 'M1',
        isDefault: true,
        efforts: [],
        serviceTiers: tiers('priority', 'Fast')
      },
      { id: 'm2', label: 'M2', isDefault: false, efforts: [], serviceTiers: tiers('flex', 'Flex') }
    ],
    listedModelIds: ['m1', 'm2'],
    current: { model, serviceTier, confirmed: ['model'] }
  })
  const speed = (controller: Controller) => {
    const kind = descriptorFor(controller.optionSnapshot, 'serviceTier')?.kind
    return kind?.type === 'select'
      ? { value: kind.currentValue, choices: kind.choices.map((choice) => choice.value) }
      : null
  }

  it('keeps the confirmed model after a lost pick reply, as desktop does', async () => {
    const client = optionsClient(() => Promise.resolve(answer('m1', 'priority')))
    const { mutate } = recordingMutate(async () => ({ status: 'unknown' }))
    const harness = await mountOptions({ ...BASE, client: client.client, mutate })

    let picked = true
    await act(async () => {
      picked = await harness.current().setStructuredOption('model', 'm2')
    })
    expect(picked).toBe(false)
    expect(currentValueOf(harness.current().optionSnapshot, 'model')).toBe('m1')
    expect(speed(harness.current())?.value).toBe('priority')
    expect(harness.current().pendingOptionId).toBeNull()
    await harness.unmount()
  })
})

it('refuses a typed literal at an unresolved fence and accepts it when that fence is ready with no menu', async () => {
  const pending = deferred<AgentSessionOptionsResult>()
  let reads = 0
  const client = optionsClient(() =>
    ++reads === 1 ? Promise.resolve({ models: [], current: {} }) : pending.promise
  )
  const { calls, mutate } = recordingMutate(async () =>
    accepted({ key: 'model', value: 'literal', options: { model: 'literal' } }, true)
  )
  const view = await mountOptions({ ...BASE, client: client.client, mutate })
  await view.rerender({ fence: 2 })
  let result = true
  await act(async () => {
    result = await view.current().setStructuredOption('model', 'literal')
  })
  expect(result).toBe(false)
  expect(calls).toHaveLength(0)
  await act(async () => pending.resolve({ models: [], current: {} }))
  await settle()
  await act(async () => {
    result = await view.current().setStructuredOption('model', 'literal')
  })
  expect(result).toBe(true)
  expect(calls).toHaveLength(1)
  await view.unmount()
})
