import { useEffect, useMemo, useRef } from 'react'
import { findActivityTerminalPortal } from './activity/activity-terminal-portal'
import {
  canWatcherCoverParkedTerminalTab,
  syncParkedTerminalTabWatchersForWorkspaces,
  type ParkedTerminalTabWatcherSyncEntry
} from './terminal-pane/parking/output-watchers/terminal-parked-tab-watchers'
import {
  disposeAllParkedTerminalWatchers,
  pruneParkedTerminalWatchers,
  terminalWatcherLiveWorkspaceIds
} from './terminal-pane/parking/output-watchers/terminal-parked-watcher-registry'

import { useAppStore } from '@/store'
import { gateWorktreeAgentActivation } from '@/lib/workspace/activation/worktree-agent-activation-gate'
import { createWorkspaceTerminalHostAuthoritySelector } from '@/lib/workspace/ownership/workspace-terminal-host-authority'
import type { TerminalColdActivationController } from './terminal-cold-activation'
import { selectParkedEquivalentMountTabIds } from './terminal/startup-terminal-tab-hold'

// Why shared: surfaces without watchable live tabs need no per-pass allocation.
const NO_PARKED_TAB_IDS: ReadonlySet<string> = new Set()

type TerminalWatcherController = Pick<
  TerminalColdActivationController,
  | 'activationDeferredMountTabIdsByWorktreeRef'
  | 'activeTabId'
  | 'activeTabIdByWorktree'
  | 'activeView'
  | 'activeWorktreeId'
  | 'activityTerminalPortals'
  | 'anyMountedWorktreeHasLayout'
  | 'backgroundMountRevision'
  | 'createTab'
  | 'reconcileWorktreeTabModel'
  | 'effectiveParkedTerminalWorktreeIds'
  | 'evictionExemptTerminalTabIds'
  | 'getEffectiveLayoutForWorktree'
  | 'groupsByWorktree'
  | 'hydrationSucceeded'
  | 'measurableBackgroundWorktreeIdsRef'
  | 'mountedWorktreeIdsRef'
  | 'pairedRuntimeParkingEnvironmentIds'
  | 'pendingStartupByTabId'
  | 'renderedActiveWorktreeId'
  | 'startupTerminalTabHold'
  | 'tabsByWorktree'
  | 'terminalParkingEnabled'
  | 'terminalProviderSnapshotCapabilityRevision'
  | 'terminalSshParkingEnabled'
  | 'terminalStartupRestorationReady'
  | 'terminalTitleSnapshotAuthorityEnabled'
  | 'workspaceSessionReady'
  | 'workspaceSurfaceIds'
>

export function useTerminalWatcherEffects(controller: TerminalWatcherController): void {
  const {
    activationDeferredMountTabIdsByWorktreeRef,
    activeTabId,
    activeTabIdByWorktree,
    activeView,
    activeWorktreeId,
    activityTerminalPortals,
    anyMountedWorktreeHasLayout,
    backgroundMountRevision,
    effectiveParkedTerminalWorktreeIds,
    evictionExemptTerminalTabIds,
    getEffectiveLayoutForWorktree,
    groupsByWorktree,
    hydrationSucceeded,
    measurableBackgroundWorktreeIdsRef,
    mountedWorktreeIdsRef,
    pairedRuntimeParkingEnvironmentIds,
    pendingStartupByTabId,
    renderedActiveWorktreeId,
    startupTerminalTabHold,
    tabsByWorktree,
    terminalParkingEnabled,
    terminalProviderSnapshotCapabilityRevision,
    terminalSshParkingEnabled,
    terminalStartupRestorationReady,
    terminalTitleSnapshotAuthorityEnabled,
    workspaceSessionReady,
    workspaceSurfaceIds
  } = controller

  useEffect(() => {
    pruneParkedTerminalWatchers(terminalWatcherLiveWorkspaceIds(workspaceSurfaceIds))
    const syncEntriesByWorktreeId = new Map<string, ParkedTerminalTabWatcherSyncEntry>()
    for (const workspaceId of workspaceSurfaceIds) {
      if (
        anyMountedWorktreeHasLayout &&
        mountedWorktreeIdsRef.current.has(workspaceId) &&
        getEffectiveLayoutForWorktree(workspaceId)
      ) {
        continue
      }
      const tabs = tabsByWorktree[workspaceId] ?? []
      let parkedTabIds: ReadonlySet<string> = NO_PARKED_TAB_IDS
      let deferredTabIds: ReadonlySet<string> | null = null
      if (!anyMountedWorktreeHasLayout && mountedWorktreeIdsRef.current.has(workspaceId)) {
        const mountedParkedTabIds = new Set<string>()
        parkedTabIds = mountedParkedTabIds
        const isVisible = activeView === 'terminal' && workspaceId === renderedActiveWorktreeId
        const shouldMeasureHiddenWorktree =
          !isVisible && measurableBackgroundWorktreeIdsRef.current.has(workspaceId)
        const parked =
          !isVisible &&
          !shouldMeasureHiddenWorktree &&
          effectiveParkedTerminalWorktreeIds.has(workspaceId)
        if (parked) {
          for (const tab of tabs) {
            const activityTerminalPortal = findActivityTerminalPortal(activityTerminalPortals, {
              worktreeId: workspaceId,
              tabId: tab.id
            })
            if (!activityTerminalPortal && !evictionExemptTerminalTabIds.has(tab.id)) {
              mountedParkedTabIds.add(tab.id)
            }
          }
        }
        deferredTabIds = selectParkedEquivalentMountTabIds(
          activationDeferredMountTabIdsByWorktreeRef.current.get(workspaceId),
          startupTerminalTabHold,
          workspaceId
        )
        for (const tab of tabs) {
          if (
            deferredTabIds?.has(tab.id) &&
            !mountedParkedTabIds.has(tab.id) &&
            canWatcherCoverParkedTerminalTab(workspaceId, tab) &&
            !findActivityTerminalPortal(activityTerminalPortals, {
              worktreeId: workspaceId,
              tabId: tab.id
            })
          ) {
            mountedParkedTabIds.add(tab.id)
          }
        }
      }
      if (tabs.length > 0 && !mountedWorktreeIdsRef.current.has(workspaceId)) {
        const backgroundTabIds = tabs
          .filter(
            (tab) =>
              canWatcherCoverParkedTerminalTab(workspaceId, tab) &&
              !findActivityTerminalPortal(activityTerminalPortals, {
                worktreeId: workspaceId,
                tabId: tab.id
              })
          )
          .map((tab) => tab.id)
        if (backgroundTabIds.length > 0) {
          // CLI-created live terminals have never mounted a pane to consume host title facts.
          parkedTabIds = new Set(backgroundTabIds)
          deferredTabIds = parkedTabIds
        }
      }
      syncEntriesByWorktreeId.set(workspaceId, {
        tabs,
        parkedTabIds,
        ...(deferredTabIds ? { restoreTitleOnStartTabIds: deferredTabIds } : {})
      })
    }
    syncParkedTerminalTabWatchersForWorkspaces(syncEntriesByWorktreeId)
  }, [
    activationDeferredMountTabIdsByWorktreeRef,
    activeTabId,
    activeView,
    activityTerminalPortals,
    activeTabIdByWorktree,
    anyMountedWorktreeHasLayout,
    backgroundMountRevision,
    evictionExemptTerminalTabIds,
    getEffectiveLayoutForWorktree,
    groupsByWorktree,
    effectiveParkedTerminalWorktreeIds,
    measurableBackgroundWorktreeIdsRef,
    mountedWorktreeIdsRef,
    pairedRuntimeParkingEnvironmentIds,
    pendingStartupByTabId,
    renderedActiveWorktreeId,
    startupTerminalTabHold,
    tabsByWorktree,
    terminalParkingEnabled,
    terminalProviderSnapshotCapabilityRevision,
    terminalSshParkingEnabled,
    terminalTitleSnapshotAuthorityEnabled,
    workspaceSessionReady,
    workspaceSurfaceIds
  ])
  useEffect(() => () => disposeAllParkedTerminalWatchers(), [])

  // Subscribe so host answers rerun the passes; retain owner resolution to avoid repeating catalog walks on every store write (STA-3363).
  const hostAuthoritySelector = useMemo(
    () => createWorkspaceTerminalHostAuthoritySelector(activeWorktreeId),
    [activeWorktreeId]
  )
  const activeWorktreeHostAuthority = useAppStore(hostAuthoritySelector)
  const startupResumeWorktreeIdsRef = useRef(new Set<string>())
  useEffect(() => {
    if (
      !workspaceSessionReady ||
      !terminalStartupRestorationReady ||
      !hydrationSucceeded ||
      !activeWorktreeId
    ) {
      return
    }
    if (startupResumeWorktreeIdsRef.current.has(activeWorktreeId)) {
      return
    }
    // Do not consume recovery while the host is unanswered or sleeping agents remain stranded for this session.
    if (activeWorktreeHostAuthority === 'unverifiable') {
      return
    }
    startupResumeWorktreeIdsRef.current.add(activeWorktreeId)
    // Startup recovery needs the same host census and in-flight gate as explicit activation.
    void gateWorktreeAgentActivation(activeWorktreeId).then(
      (outcome) => {
        if (outcome === 'blocked') {
          startupResumeWorktreeIdsRef.current.delete(activeWorktreeId)
        }
      },
      () => startupResumeWorktreeIdsRef.current.delete(activeWorktreeId)
    )
  }, [
    activeWorktreeId,
    activeWorktreeHostAuthority,
    hydrationSucceeded,
    terminalStartupRestorationReady,
    workspaceSessionReady
  ])
}
