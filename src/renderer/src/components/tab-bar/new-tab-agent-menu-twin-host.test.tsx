// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store/index'
import { getRuntimeAgentInventoryKey } from '@/store/slices/agent-inventory/runtime-agent-inventory-key'
import { useAgentDetectionTargetForWorktree } from '@/lib/agent-session/launch/inventory/useAgentDetectionTarget'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/hosts/capabilities/local-runtime-capabilities'
import { resetRendererAppPlatformCacheForTests } from '@/app-shell/platform/renderer-app-platform'
import { getDefaultSettings } from '../../../../shared/orca-profiles/constants'
import { EVERY_AGENT_CHAT } from '../../../../shared/native-chat/every-agent-chat.test-fixture'
import {
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY as CHAT,
  STRUCTURED_AGENT_SESSION_CLIENT_LAUNCH_MODE_CAPABILITY as CLIENT
} from '../../../../shared/agent-session/capabilities/agent-session-runtime-capabilities'
import {
  NEW_TAB_TWIN_HOSTS,
  NEW_TAB_PAIRED_STATUS,
  newTabTwinHostWorkspaces
} from './new-tab-agent-menu-twin-host.test-fixture'
import { useAgentMenuObservation } from '../agent/launch-menu/use-new-tab-agent-menu-rows'

const initial = useAppStore.getState()
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  setLocalRuntimeCapabilitiesForTests(null)
  resetRendererAppPlatformCacheForTests()
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
