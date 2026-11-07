// @vitest-environment happy-dom
import { EVERY_AGENT_CHAT } from '../../../../shared/native-chat/every-agent-chat.test-fixture'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getRuntimeAgentInventoryKey } from '@/store/slices/runtime-agent-inventory-key'
import { NEW_TAB_TWIN_HOSTS, NEW_TAB_PAIRED_STATUS, newTabTwinHostWorkspaces } from './new-tab-agent-menu-twin-host.test-fixture'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import '@/lib/agent-session/launch/routing/agent-launch-route-input'
import { workspaceKindForWorktreeId } from '../../../../shared/workspace-launch-kind'
import {
  makeFolderWorkspace,
  makeWorktree,
  TEST_REPO
} from '@/store/slices/worktrees-slice-test-fixtures'
import { makeProjectGroup } from '@/components/sidebar/workspace-creation/folder/folder-workspace-composer-submit-fixtures'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/hosts/capabilities/local-runtime-capabilities'
import { getDefaultSettings } from '../../../../shared/constants'
import type { AppState } from '@/store/types'
import {
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY as CHAT,
  STRUCTURED_AGENT_SESSION_CLIENT_LAUNCH_MODE_CAPABILITY as CLIENT
} from '../../../../shared/agent-session/agent-session-runtime-capabilities'
import { useAgentMenuObservation, useNewTabAgentMenuRows } from './use-new-tab-agent-menu-rows'
const initial = useAppStore.getState()
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  setLocalRuntimeCapabilitiesForTests(null)
})
it('settles ownerless continuation and plus inventory without borrowing agents, then recovers on hydration', async () => {
  const group = makeProjectGroup()
  const folder = makeFolderWorkspace({ id: 'f1', projectGroupId: group.id, folderPath: '/work' })
  const repo = { ...TEST_REPO, id: 'r1', path: '/work/local' }
  const cases: { worktreeId: string; rows: Partial<AppState> }[] = [
    {
      worktreeId: 'folder:f1',
      rows: {
        folderWorkspaces: [
          { ...folder, executionHostId: 'local' },
          { ...folder, executionHostId: 'ssh:other' }
        ]
      }
    },
    {
      worktreeId: 'folder:f1',
      rows: {
        folderWorkspaces: [folder],
        projectGroups: [group],
        repos: [repo, { ...repo, id: 'r2', path: '/work/remote', connectionId: 'other' }]
      }
    },
    { worktreeId: 'r1::/remote/restored', rows: { repos: [repo] } }
  ]
  for (const { worktreeId, rows } of cases) {
    const local = vi.fn<AppState['ensureDetectedAgents']>(async () => ['claude'])
    const otherHost = vi.fn(async () => [])
    const getStatus = vi.fn()
    Object.assign(window, { api: { runtime: { getStatus } } })
    setLocalRuntimeCapabilitiesForTests(worktreeId.startsWith('folder:') ? null : [CHAT, CLIENT])
    useAppStore.setState({
      ...initial,
      settings: { ...getDefaultSettings('/home/me'), nativeChatProviders: EVERY_AGENT_CHAT },
      activeWorktreeId: worktreeId,
      activeWorkspaceExecutionHostId: null,
      folderWorkspaces: [],
      projectGroups: [],
      repos: [],
      worktreesByRepo: {},
      detectedWorktreesByRepo: {},
      restoredRuntimeHostIdByWorkspaceSessionKey: {},
      detectedAgentIds: ['gemini'],
      remoteDetectedAgentIds: { other: ['codex'] },
      ensureDetectedAgents: local,
      ensureRemoteDetectedAgents: otherHost,
      ensureRuntimeDetectedAgents: otherHost,
      ...rows
    })
    const hook = renderHook(() => {
      const target = useAgentDetectionTargetForWorktree(worktreeId)
      const workspace = { kind: workspaceKindForWorktreeId(worktreeId), worktreeId }
      return {
        form: useAgentMenuObservation({ workspace }, true, target),
        plus: useNewTabAgentMenuRows(worktreeId, true, target)
      }
    })
    expect(hook.result.current.form.detection).toMatchObject({ detectedIds: [], isLoading: false })
    expect(hook.result.current.form.selectionFor('claude', 'terminal').ready).toBe(false)
    for (const model of [hook.result.current.form.model, hook.result.current.plus]) {
      expect(model.state).toBe('settled')
      expect(
        model.state === 'settled' &&
          model.rows.every(
            (row) =>
              row.kind === 'chat-unavailable' &&
              row.reason === 'check-failed' &&
              row.executionHostId === undefined
          )
      ).toBe(true)
    }
    for (const probe of [local, otherHost, getStatus]) {
      expect(probe).not.toHaveBeenCalled()
    }
    local.mockImplementation(async () => {
      useAppStore.setState({ detectedAgentIds: ['claude'] })
      return ['claude']
    })
    await act(async () => {
      setLocalRuntimeCapabilitiesForTests([CHAT, CLIENT])
      useAppStore.setState({
        folderWorkspaces: [{ ...folder, executionHostId: 'local' }],
        repos: [repo],
        worktreesByRepo: {
          r1: [makeWorktree({ id: worktreeId, repoId: 'r1', hostId: 'local', path: '/work/local' })]
        },
        detectedAgentIds: null
      })
    })
    expect(hook.result.current.form.detection.detectedIds).toEqual(['claude'])
    expect(hook.result.current.form.selectionFor('claude').ready).toBe(true)
    expect(
      hook.result.current.plus.state === 'settled' && hook.result.current.plus.rows
    ).toContainEqual({ kind: 'chat', agent: 'claude', executionHostId: 'local' })
    hook.unmount()
  }
})

it.each(['git-worktree', 'folder'] as const)(
  'keeps %s discovery and chat rows on the explicitly named twin host',
  async (kind) => {
    const worktreeId = kind === 'folder' ? 'folder:twins' : `${TEST_REPO.id}::/work/twins`
    const twinWorkspaces = newTabTwinHostWorkspaces(worktreeId)
    const status = NEW_TAB_PAIRED_STATUS.status
    if (!status) {
      throw new Error('Paired runtime fixture has no status')
    }
    const pairedStatus = {
      ...NEW_TAB_PAIRED_STATUS,
      status: { ...status, capabilities: [CHAT, CLIENT] }
    }
    Object.assign(window, { api: { runtime: { getStatus: vi.fn() } } })
    setLocalRuntimeCapabilitiesForTests([CHAT, CLIENT])
    useAppStore.setState({
      ...initial,
      settings: { ...getDefaultSettings('/home/me'), nativeChatProviders: EVERY_AGENT_CHAT },
      repos: NEW_TAB_TWIN_HOSTS.map((executionHostId) => ({ ...TEST_REPO, executionHostId })),
      ...twinWorkspaces,
      runtimeStatusByEnvironmentId: new Map([['paired', pairedStatus]]),
      detectedWorktreesByRepo: {},
      detectedAgentIds: ['codex'],
      runtimeDetectedAgentIds: { [getRuntimeAgentInventoryKey('paired', worktreeId)]: ['codex'] },
      ensureDetectedAgents: vi.fn(async () => ['codex' as const]),
      ensureRuntimeDetectedAgents: vi.fn(async () => ['codex' as const])
    })
    for (const executionHostId of NEW_TAB_TWIN_HOSTS) {
      const workspace = { kind, worktreeId, executionHostId }
      const hook = renderHook(() => {
        const target = useAgentDetectionTargetForWorktree(worktreeId, executionHostId)
        return { target, menu: useAgentMenuObservation({ workspace }, true, target) }
      })
      await act(async () => {})
      for (const activeHost of [null, ...NEW_TAB_TWIN_HOSTS]) {
        act(() =>
          useAppStore.setState({
            activeWorktreeId: activeHost === null ? 'elsewhere' : worktreeId,
            activeWorkspaceExecutionHostId: activeHost
          })
        )
        expect(hook.result.current.target).toEqual(
          executionHostId === 'local'
            ? { kind: 'local' }
            : { kind: 'runtime', environmentId: 'paired', worktreeId }
        )
        const model = hook.result.current.menu.model
        expect(model.state).toBe('settled')
        expect(model.state === 'settled' && model.rows).toContainEqual({
          kind: 'chat',
          agent: 'codex',
          executionHostId
        })
      }
      act(() =>
        useAppStore.setState({
          worktreesByRepo: {
            [TEST_REPO.id]: useAppStore
              .getState()
              .worktreesByRepo[TEST_REPO.id].filter((row) => row.hostId !== executionHostId)
          },
          folderWorkspaces: useAppStore
            .getState()
            .folderWorkspaces.filter((row) => row.executionHostId !== executionHostId)
        })
      )
      expect(hook.result.current.target).toBeUndefined()
      const stale = hook.result.current.menu.model
      expect(stale.state === 'settled' && stale.rows.some((row) => row.kind === 'chat')).toBe(false)
      hook.unmount()
      useAppStore.setState(twinWorkspaces)
    }
  }
)
