// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionModelCatalogResult } from '../../../../shared/agent-session-wire'
import { AGENT_SESSION_MODEL_CATALOG_SAVED_ONLY_RUNTIME_CAPABILITY } from '../../../../shared/structured-agent-session-surface-capabilities'
import { useWorkerRoleModelCatalog } from './use-worker-role-model-catalog'

const fixture = vi.hoisted(() => ({
  catalogs: new Map<string, AgentSessionModelCatalogResult>(),
  preload: vi.fn(),
  capabilities: vi.fn(),
  settings: { activeCodexManagedAccountId: 'work' }
}))
vi.mock('@/runtime/host-model-catalog-snapshots', () => ({
  readHostModelCatalogSnapshot: (_target: unknown, agent: string) => fixture.catalogs.get(agent),
  preloadHostModelCatalogSnapshots: (...args: unknown[]) => fixture.preload(...args)
}))
vi.mock('@/runtime/local-runtime-capabilities', () => ({
  ensureLocalRuntimeCapabilities: () => fixture.capabilities()
}))
vi.mock('@/store', () => ({
  useAppStore: () => fixture.settings
}))

const catalog: AgentSessionModelCatalogResult = {
  origin: 'probe',
  fetchedAt: 1,
  models: [
    {
      id: 'new-host-model',
      label: 'New host model',
      isDefault: false,
      efforts: [
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' }
      ]
    }
  ]
}

beforeEach(() => {
  fixture.catalogs.clear()
  fixture.preload.mockReset()
  fixture.capabilities.mockResolvedValue([
    AGENT_SESSION_MODEL_CATALOG_SAVED_ONLY_RUNTIME_CAPABILITY
  ])
  fixture.settings = { activeCodexManagedAccountId: 'work' }
})
afterEach(cleanup)

describe('worker role model catalogs', () => {
  it('offers newly listed host models through the existing saved-only catalog route', async () => {
    fixture.preload.mockImplementation(async () => {
      fixture.catalogs.set('codex', catalog)
    })
    const { result } = renderHook(() => useWorkerRoleModelCatalog('codex'))
    await waitFor(() => expect(result.current.catalog?.models[0]?.id).toBe('new-host-model'))
    expect(fixture.preload).toHaveBeenCalledWith({ kind: 'local' }, ['codex'], { savedOnly: true })
    expect(result.current.catalog?.models[0]?.options[0]?.kind).toMatchObject({
      type: 'select',
      choices: [{ value: 'low' }, { value: 'high' }]
    })
  })

  it('demands a live host listing when the model menu is opened instead of retaining only saved seeds', async () => {
    fixture.preload.mockImplementation(async (_target, _agents, options) => {
      if (options.awaitListing) {
        fixture.catalogs.set('codex', {
          ...catalog,
          models: [
            { ...catalog.models[0], id: 'gpt-6.1-sol', label: 'GPT 6.1 Sol' },
            { ...catalog.models[0], id: 'gpt-6-astra', label: 'GPT 6 Astra' }
          ]
        })
      }
    })
    const { result } = renderHook(() => useWorkerRoleModelCatalog('codex'))
    await waitFor(() =>
      expect(fixture.preload).toHaveBeenCalledWith({ kind: 'local' }, ['codex'], {
        savedOnly: true
      })
    )
    act(() => result.current.refresh())
    await waitFor(() =>
      expect(result.current.catalog?.models.map((model) => model.id)).toEqual([
        'gpt-6.1-sol',
        'gpt-6-astra'
      ])
    )
    expect(fixture.preload).toHaveBeenLastCalledWith({ kind: 'local' }, ['codex'], {
      awaitListing: true
    })
  })

  it('withholds unproven built-in model choices when a capable host has no saved catalog', async () => {
    fixture.preload.mockResolvedValue(undefined)
    const { result } = renderHook(() => useWorkerRoleModelCatalog('codex'))
    await waitFor(() => expect(result.current.catalog).toBeNull())
  })

  it('settles a failed capability refresh without offering unverified models', async () => {
    fixture.preload.mockResolvedValue(undefined)
    const { result } = renderHook(() => useWorkerRoleModelCatalog('codex'))
    await waitFor(() => expect(result.current.catalog).toBeNull())
    fixture.capabilities.mockRejectedValueOnce(new Error('capability probe failed'))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.isRefreshing).toBe(false))
    expect(result.current.catalog).toBeNull()
  })

  it('keeps the built-in choices without a listing request on older hosts', async () => {
    fixture.capabilities.mockResolvedValue([])
    const { result } = renderHook(() => useWorkerRoleModelCatalog('codex'))
    await act(async () => {})
    expect(fixture.preload).not.toHaveBeenCalled()
    expect(result.current.catalog?.models.some((model) => model.id === 'gpt-5.6-sol')).toBe(true)
  })

  it('drops loaded choices after an account change and ignores the old in-flight agent read', async () => {
    let finish: (() => void) | undefined
    fixture.preload.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const { result, rerender } = renderHook(({ agent }) => useWorkerRoleModelCatalog(agent), {
      initialProps: { agent: 'codex' }
    })
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    rerender({ agent: 'claude' })
    await act(async () => {
      fixture.catalogs.set('codex', catalog)
      finish?.()
    })
    expect(result.current.catalog?.models.some((model) => model.id === 'new-host-model')).not.toBe(
      true
    )
    fixture.preload.mockImplementation(async () => {
      fixture.catalogs.set('codex', catalog)
    })
    rerender({ agent: 'codex' })
    await waitFor(() => expect(result.current.catalog?.models[0]?.id).toBe('new-host-model'))
    fixture.catalogs.clear()
    fixture.settings = { activeCodexManagedAccountId: 'personal' }
    fixture.preload.mockImplementation(async () => {})
    rerender({ agent: 'codex' })
    expect(result.current.catalog?.models.some((model) => model.id === 'new-host-model')).not.toBe(
      true
    )
  })
})
