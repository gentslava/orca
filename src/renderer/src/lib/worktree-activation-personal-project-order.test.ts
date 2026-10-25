import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from './worktree-activation'
import { repo, worktree } from '../components/sidebar/worktree-list-groups-test-fixtures'
import { getDefaultUIState } from '../../../shared/constants'
import { mutatePersonalProjectOrder } from '../../../shared/personal-project-order-writes'
import { RecordProjectOpenParams } from '../../../shared/rpc-contract/personal-project-order-params'
import type { PendingWorktreeCreation } from './pending-worktree-creation'

vi.mock('../runtime/local-runtime-capabilities', () => ({
  ensureLocalRuntimeCapabilities: async () => ['ui.personalProjectOrder.v1']
}))

const initial = useAppStore.getState()
afterEach(() => {
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('successful deliberate personal project activation', () => {
  it('counts completed cross-project opens and ignores pending, failed, background and same-project transitions', async () => {
    let ui = getDefaultUIState()
    const runtime = {
      getUIState: () => ui,
      updateUIState: (patch: Partial<typeof ui>) => (ui = { ...ui, ...patch })
    }
    const call = vi.fn(async (request: { method: string; params?: unknown }) => ({
      id: 'record',
      ok: true,
      result:
        request.method === 'ui.recordProjectOpen'
          ? mutatePersonalProjectOrder(runtime, RecordProjectOpenParams.parse(request.params))
          : { ui }
    }))
    vi.stubGlobal('window', { api: { runtime: { call } } })
    const a = { ...repo, id: 'a', path: '/a', executionHostId: 'local' as const }
    const b = { ...repo, id: 'b', path: '/b', executionHostId: 'local' as const }
    const wa = { ...worktree, id: 'a::/a/one', repoId: 'a', path: '/a/one' }
    const wa2 = { ...wa, id: 'a::/a/two', path: '/a/two' }
    const wb = { ...worktree, id: 'b::/b/one', repoId: 'b', path: '/b/one' }
    useAppStore.setState({
      repos: [a, b],
      projects: [],
      projectHostSetups: [],
      worktreesByRepo: { a: [wa, wa2], b: [wb] },
      activeRepoId: 'b',
      activeWorktreeId: wb.id,
      activeView: 'terminal',
      activeWorkspaceExecutionHostId: 'local',
      tabsByWorktree: {},
      ptyIdsByTabId: {},
      everActivatedWorktreeIds: new Set([wa.id, wa2.id, wb.id]),
      recordWorktreeVisit: vi.fn(),
      markWorktreeVisited: vi.fn(),
      refreshGitHubForWorktreeIfStale: vi.fn(),
      getKnownWorktreeById: (id) => [wa, wa2, wb].find((entry) => entry.id === id),
      setActiveRepo: (id) => useAppStore.setState({ activeRepoId: id }),
      setActiveWorktree: (id, host) => {
        useAppStore.setState({ activeWorktreeId: id, activeWorkspaceExecutionHostId: host ?? null })
        return true
      }
    })
    const deliberate = {
      navigationIntent: 'user-open' as const,
      providesInitialSurface: true,
      revealInSidebar: false,
      clearSidebarFilters: false,
      executionHostId: 'local' as const
    }
    const creation: PendingWorktreeCreation = {
      creationId: 'create-a',
      worktreeId: wa.id,
      phase: 'creating',
      status: 'creating',
      startedAt: 1,
      indeterminate: false,
      loaderVisible: false,
      request: {
        repoId: a.id,
        name: 'one',
        setupDecision: 'inherit',
        agent: null,
        pendingFirstAgentMessageRename: false,
        note: '',
        startupPlan: null,
        quickPrompt: '',
        quickTelemetry: null
      }
    }
    useAppStore.getState().beginPendingWorktreeCreation(creation)
    expect(activateAndRevealWorktree(wa.id, deliberate)).toEqual({ primaryTabId: null })
    activateAndRevealWorktree(wa.id, deliberate)
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(useAppStore.getState().activeWorktreeId).toBe(wb.id)
    expect(useAppStore.getState().activePendingCreationId).toBe(creation.creationId)
    expect(useAppStore.getState().pendingWorktreeCreations[creation.creationId].loaderVisible).toBe(
      true
    )
    expect(call).not.toHaveBeenCalled()
    useAppStore.getState().updatePendingWorktreeCreation(creation.creationId, { status: 'error' })
    useAppStore.getState().removePendingWorktreeCreation(creation.creationId)
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(ui.personalProjectOrder).toBeUndefined()
    useAppStore.getState().beginPendingWorktreeCreation(creation)
    activateAndRevealWorktree(wa.id, { ...deliberate, worktreeCreationId: creation.creationId })
    await vi.waitFor(() => expect(ui).toHaveProperty('personalProjectOrder'))
    useAppStore.getState().removePendingWorktreeCreation(creation.creationId)
    const first = ui.personalProjectOrder
    expect(first).toMatchObject({ projects: { '["local","local","repo:a"]': { openCount: 1 } } })
    activateAndRevealWorktree(wa.id, deliberate)
    activateAndRevealWorktree(wa2.id, deliberate)
    expect(activateAndRevealWorktree('missing', deliberate)).toBe(false)
    activateAndRevealWorktree(wb.id, {
      providesInitialSurface: true,
      revealInSidebar: false,
      clearSidebarFilters: false
    })
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(ui.personalProjectOrder).toEqual(first)
    activateAndRevealWorktree(wa.id, deliberate)
    await vi.waitFor(() =>
      expect(ui.personalProjectOrder?.projects['["local","local","repo:a"]'].openCount).toBe(2)
    )
    useAppStore.setState({ setActiveWorktree: () => false })
    activateAndRevealWorktree(wb.id, deliberate)
    await new Promise<void>((resolve) => queueMicrotask(resolve))
    expect(ui.personalProjectOrder?.projects['["local","local","repo:b"]']).toBeUndefined()
  })
})
