import { useMemo } from 'react'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { deriveAiVaultWorkspaceScopePaths } from './ai-vault-scope-paths'
import {
  buildAiVaultProjectContext,
  buildAiVaultSessionProjectById
} from './ai-vault-session-projects'

type ProjectContextArgs = Omit<Parameters<typeof buildAiVaultProjectContext>[0], 'sessions'>
type SessionProjectArgs = Omit<Parameters<typeof buildAiVaultSessionProjectById>[0], 'sessions'>

export function useAiVaultPanelProjectContext({
  folderWorkspaces,
  repos,
  worktrees,
  projectHostSetupProjection,
  activeRepo,
  activeWorktree
}: ProjectContextArgs) {
  const activeWorktreePaths = useMemo(
    () => deriveAiVaultWorkspaceScopePaths(activeWorktree, worktrees),
    [activeWorktree, worktrees]
  )
  const context = useMemo(
    () =>
      buildAiVaultProjectContext({
        folderWorkspaces,
        repos,
        worktrees,
        projectHostSetupProjection,
        activeRepo,
        activeWorktree,
        sessions: []
      }),
    [activeRepo, activeWorktree, worktrees, projectHostSetupProjection, repos, folderWorkspaces]
  )
  return { ...context, activeWorktreePaths }
}

export function useAiVaultPanelSessionProjects(
  { folderWorkspaces, repos, worktrees, projectHostSetupProjection }: SessionProjectArgs,
  history: readonly AiVaultSession[],
  indexed: readonly AiVaultSession[],
  searching: boolean,
  includeHistory: boolean
) {
  const sessions = useMemo(
    () => (searching ? (includeHistory ? [...history, ...indexed] : indexed) : history),
    [includeHistory, searching, history, indexed]
  )
  return useMemo(
    () =>
      buildAiVaultSessionProjectById({
        folderWorkspaces,
        repos,
        worktrees,
        projectHostSetupProjection,
        sessions
      }),
    [worktrees, projectHostSetupProjection, repos, sessions, folderWorkspaces]
  )
}
