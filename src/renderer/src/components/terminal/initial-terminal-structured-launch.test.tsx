// @vitest-environment happy-dom
import type * as ParkedWatcherRegistryModule from '../terminal-pane/parking/output-watchers/terminal-parked-watcher-registry'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTerminalWatcherEffects } from './workbench/use-terminal-watcher-effects'
import type { PendingWorktreeCreation } from '@/lib/workspace/creation/pending-worktree-creation'

const mocks = vi.hoisted(() => {
  const storeTabsByWorktree: Record<string, unknown[]> = {}
  const storeClosedRecords: Record<string, { worktreeId: string; closedAt: number }> = {}
  const storePendingCreations: Record<string, PendingWorktreeCreation> = {}
  const bots: { folderWorkspaceId: string }[] = []
  return {
    gate: vi.fn(),
    resume: vi.fn(),
    authority: 'none',
    launchStatus: vi.fn((_worktreeId: string, _provider: string): string => 'idle'),
    createTab: vi.fn(),
    storeTabsByWorktree,
    storeClosedRecords,
    storePendingCreations,
    bots,
    botsEnabled: true,
    activeWorktreeId: 'wt-1'
  }
})
vi.mock('@/store', () => {
  const getState = () => ({
    activeWorktreeId: mocks.activeWorktreeId,
    tabsByWorktree: mocks.storeTabsByWorktree,
    closedTerminalTabTombstonesByTabId: mocks.storeClosedRecords,
    pendingWorktreeCreations: mocks.storePendingCreations
  })
  return {
    useAppStore: Object.assign(
      (selector: (state: ReturnType<typeof getState>) => unknown) => selector(getState()),
      { getState }
    )
  }
})
vi.mock('@/lib/workspace/activation/worktree-agent-activation-gate', () => ({
  gateWorktreeAgentActivation: mocks.gate
}))
vi.mock('@/lib/agent-session/launch/structured-agent-session-launch-status', () => ({
  hasStructuredAgentLaunchInWorktree: (worktreeId: string) =>
    ['claude', 'codex', 'grok'].some((agent) => mocks.launchStatus(worktreeId, agent) !== 'idle')
}))
vi.mock('@/lib/bot-catalog', () => ({
  readBots: () => mocks.bots,
  readBotsEnabled: () => mocks.botsEnabled,
  useBots: () => mocks.bots,
  useBotsEnabled: () => true
}))
vi.mock('@/lib/agent-session/resume/resume-sleeping-agent-session', () => ({
  resumeSleepingAgentSessionsForWorktree: mocks.resume
}))
vi.mock('@/lib/workspace/ownership/workspace-terminal-host-authority', () => ({
  createWorkspaceTerminalHostAuthoritySelector: () => () => mocks.authority
}))
vi.mock('../terminal-pane/parking/output-watchers/terminal-parked-tab-watchers', () => ({
  syncParkedTerminalTabWatchersForWorkspaces: vi.fn()
}))

vi.mock(
  '../terminal-pane/parking/output-watchers/terminal-parked-watcher-registry',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ParkedWatcherRegistryModule>()),
    pruneParkedTerminalWatchers: vi.fn(),
    terminalWatcherLiveWorkspaceIds: () => new Set(),
    disposeAllParkedTerminalWatchers: vi.fn()
  })
)

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
afterEach(async () => {
  await act(async () => root?.unmount())
  vi.clearAllMocks()
  mocks.authority = 'none'
  mocks.storeTabsByWorktree = {}
  mocks.storeClosedRecords = {}
  mocks.storePendingCreations = {}
  mocks.bots = []
  mocks.botsEnabled = true
  mocks.activeWorktreeId = 'wt-1'
})

function Watcher({ restored = true, hydrated = false, worktreeId = 'wt-1' } = {}): null {
  useTerminalWatcherEffects({
    activeWorktreeId: worktreeId,
    workspaceSessionReady: true,
    terminalStartupRestorationReady: restored,
    hydrationSucceeded: hydrated,
    workspaceSurfaceIds: [],
    workspaceSurfaceIdSet: new Set(),
    tabsByWorktree: {},
    createTab: mocks.createTab,
    reconcileWorktreeTabModel: () => ({
      renderableTabCount: 0,
      activeRenderableTabId: null
    }),
    activationDeferredMountTabIdsByWorktreeRef: { current: new Map() },
    activeTabId: null,
    activeTabIdByWorktree: {},
    activeView: 'terminal',
    activityTerminalPortals: [],
    anyMountedWorktreeHasLayout: false,
    backgroundMountRevision: 0,
    effectiveParkedTerminalWorktreeIds: new Set(),
    evictionExemptTerminalTabIds: new Set(),
    getEffectiveLayoutForWorktree: () => undefined,
    groupsByWorktree: {},
    measurableBackgroundWorktreeIdsRef: { current: new Set() },
    mountedWorktreeIdsRef: { current: new Set() },
    pairedRuntimeParkingEnvironmentIds: new Set(),
    pendingStartupByTabId: {},
    renderedActiveWorktreeId: worktreeId,
    startupTerminalTabHold: null,
    terminalParkingEnabled: false,
    terminalProviderSnapshotCapabilityRevision: 0,
    terminalSshParkingEnabled: false,
    terminalTitleSnapshotAuthorityEnabled: false
  })
  return null
}

describe('startup agent recovery host inventory', () => {
  it('keeps recovery available until the execution host answers', async () => {
    mocks.authority = 'unverifiable'
    mocks.gate.mockResolvedValue('adopted')
    root = createRoot(document.createElement('div'))
    await act(async () => root?.render(<Watcher hydrated />))
    expect(mocks.gate).not.toHaveBeenCalled()
    expect(mocks.resume).not.toHaveBeenCalled()
    mocks.authority = 'live'
    await act(async () => root?.render(<Watcher hydrated />))
    expect(mocks.gate).toHaveBeenCalledTimes(1)
    await act(async () => root?.render(<Watcher hydrated />))
    expect(mocks.gate).toHaveBeenCalledTimes(1)
  })

  it.each(['blocked', 'rejected'])(
    'retries a %s startup after leaving and returning',
    async (outcome) => {
      mocks.authority = 'live'
      if (outcome === 'rejected') {
        mocks.gate.mockRejectedValue(new Error('host unavailable'))
      } else {
        mocks.gate.mockResolvedValue('blocked')
      }
      root = createRoot(document.createElement('div'))
      await act(async () => root?.render(<Watcher hydrated />))
      expect(mocks.gate).toHaveBeenCalledTimes(1)
      await act(async () => root?.render(<Watcher hydrated worktreeId="wt-2" />))
      mocks.gate.mockResolvedValue('adopted')
      await act(async () => root?.render(<Watcher hydrated />))
      expect(mocks.gate.mock.calls.map(([id]) => id)).toEqual(['wt-1', 'wt-2', 'wt-1'])
      expect(mocks.resume).not.toHaveBeenCalled()
    }
  )
})
