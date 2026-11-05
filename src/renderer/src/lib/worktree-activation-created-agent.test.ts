import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../../shared/constants'
import { useAppStore } from '@/store'

import { activateAndRevealWorktree } from './worktree-activation'
import './web-runtime-worktree-terminal-after-wake'
import { resetWebSessionTabsSnapshotFreshnessForTests } from '@/runtime/web-session-tabs-sync/tracking-lifecycle'
import { resetWebRuntimeWakeTerminalRespawnForTests } from '@/runtime/web-runtime-wake-terminal-respawn'
import '@/runtime/web-session-tabs-sync/host-terminal-count-fixture'
import {
  makeCreatedAgentWorktree as makeWorktree,
  seedEmptyActivatableWorktree
} from '@/lib/worktree-activation-created-agent.test-fixture'
import '../runtime/runtime-environment-bridge-fixture'

// Main's answer to the window's layout commands, as a switch-on build sends them.
vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeRpcClientWithLayoutApply(await importOriginal())
)

const initialAppStoreState = useAppStore.getState()

afterEach(() => {
  delete (globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__
  vi.unstubAllGlobals()
  resetWebSessionTabsSnapshotFreshnessForTests()
  resetWebRuntimeWakeTerminalRespawnForTests()
  useAppStore.setState(initialAppStoreState, true)
})

describe('activateAndRevealWorktree', () => {
  it('does not relaunch the creation-time agent when reopening an empty worktree', () => {
    const worktree = makeWorktree()
    const { revealWorktreeInSidebar } = seedEmptyActivatableWorktree(worktree)

    const result = activateAndRevealWorktree(worktree.id)
    const state = useAppStore.getState()
    expect(result).toEqual({ primaryTabId: null })
    expect(state.tabsByWorktree[worktree.id] ?? []).toEqual([])
    expect(state.pendingStartupByTabId).toEqual({})
    expect(revealWorktreeInSidebar).toHaveBeenCalledWith(worktree.id)
  })
})
