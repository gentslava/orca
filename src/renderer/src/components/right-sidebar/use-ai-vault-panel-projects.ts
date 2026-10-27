import { useMemo } from 'react'
import type { AiVaultScope, AiVaultSession } from '../../../../shared/ai-vault-types'
import {
  deriveAiVaultScopeSessionPaths,
  deriveAiVaultWorkspaceScopePaths
} from '../../../../shared/ai-vault-scope-paths'
import { aiVaultSearchScopeIdentity } from './ai-vault-search-scope-identity'
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
  activeWorktree,
  settings
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
        settings,
        sessions: []
      }),
    [
      activeRepo,
      activeWorktree,
      worktrees,
      projectHostSetupProjection,
      repos,
      folderWorkspaces,
      settings
    ]
  )
  return { ...context, activeWorktreePaths }
}

export function useAiVaultPanelSessionProjects(
  { folderWorkspaces, repos, worktrees, projectHostSetupProjection, settings }: SessionProjectArgs,
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
        settings,
        sessions
      }),
    [worktrees, projectHostSetupProjection, repos, sessions, folderWorkspaces, settings]
  )
}

export function useAiVaultPanelScopePaths({
  activeWorktree,
  worktrees,
  projectHostSetupProjection,
  scope,
  activeProjectKey,
  legacyProjectKey
}: Pick<ProjectContextArgs, 'activeWorktree' | 'worktrees' | 'projectHostSetupProjection'> & {
  scope: AiVaultScope
  activeProjectKey: string | null
  legacyProjectKey?: string | null
}) {
  const scopePaths = useMemo(
    () =>
      deriveAiVaultScopeSessionPaths(activeWorktree, worktrees, {
        scope,
        activeProjectKey,
        projectHostSetupProjection
      }),
    [activeProjectKey, activeWorktree, worktrees, projectHostSetupProjection, scope]
  )
  // Search carries project identity because only its host can enumerate every worktree.
  const searchWithin = useMemo(
    () =>
      aiVaultSearchScopeIdentity({
        scope,
        activeWorktreeId: activeWorktree?.id,
        activeProjectKey: legacyProjectKey === undefined ? activeProjectKey : legacyProjectKey
      }),
    [activeProjectKey, legacyProjectKey, activeWorktree?.id, scope]
  )
  return { scopePaths, searchWithin }
}
