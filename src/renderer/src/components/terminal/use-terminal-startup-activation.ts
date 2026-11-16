import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { gateWorktreeAgentActivation } from '@/lib/workspace/activation/worktree-agent-activation-gate'
import { createWorkspaceTerminalHostAuthoritySelector } from '@/lib/workspace/ownership/workspace-terminal-host-authority'
import type { TerminalColdActivationController } from '../terminal-cold-activation'

type TerminalStartupController = Pick<
  TerminalColdActivationController,
  | 'activeWorktreeId'
  | 'workspaceSessionReady'
  | 'terminalStartupRestorationReady'
  | 'hydrationSucceeded'
>

export function useTerminalStartupActivation(controller: TerminalStartupController): void {
  const {
    activeWorktreeId,
    workspaceSessionReady,
    terminalStartupRestorationReady,
    hydrationSucceeded
  } = controller
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
