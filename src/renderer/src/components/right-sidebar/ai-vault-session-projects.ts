import { createNormalizedAiVaultScopeCwdMatcher } from '../../../../shared/ai-vault-scope-cwd-match'
import { resolveActiveProjectKey } from './ai-vault-project-key'
import { toAiVaultProjectKey } from '../../../../shared/ai-vault-project-key'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { ProjectHostSetupProjection } from '../../../../shared/project-host-setup-projection'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { ProjectHostSetup } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import {
  aiVaultSessionProjectCwdKey,
  matchAiVaultProjectCandidates
} from './ai-vault-session-project-candidates'
import type { AiVaultSessionProject } from '../../../../shared/ai-vault-session-filters'
import {
  aiVaultCandidateProject,
  aiVaultFolderProject,
  resolveStructuredAiVaultSessionProject
} from './ai-vault-structured-session-project'

export type { AiVaultSessionProject } from '../../../../shared/ai-vault-session-filters'

export type AiVaultProjectContext = {
  activeProjectKey: string | null
  activeRepoId: string | null
  projectLabelByKey: Map<string, string>
  sessionProjectById: Map<string, AiVaultSessionProject>
}

type SessionProjectCandidate = {
  workspaceId?: string
  source: 'worktree' | 'setup'
  normalizedPath: string
  hostKey: ExecutionHostId
  projectId: string | null
  repoId: string | null
  // Precomputed so a 500-session pass doesn't re-normalize every root per session.
  ownsNormalizedCwd: ReturnType<typeof createNormalizedAiVaultScopeCwdMatcher>
}

type ProjectResolverArgs = {
  folderWorkspaces?: readonly FolderWorkspace[]
  repos: readonly Repo[]
  worktrees: readonly Worktree[]
  projectHostSetupProjection: ProjectHostSetupProjection
  activeRepo: Repo | null
  activeWorktree: Worktree | null
  sessions: readonly AiVaultSession[]
}

export function buildAiVaultProjectContext({
  folderWorkspaces,
  repos,
  worktrees,
  projectHostSetupProjection,
  activeRepo,
  activeWorktree,
  sessions
}: ProjectResolverArgs): AiVaultProjectContext {
  const setupByRepoId = buildSetupByRepoId(projectHostSetupProjection.setups)

  return {
    activeProjectKey: resolveActiveProjectKey(activeRepo, activeWorktree, setupByRepoId),
    activeRepoId: activeRepo?.id ?? activeWorktree?.repoId ?? null,
    projectLabelByKey: buildProjectLabelByKey(repos, projectHostSetupProjection),
    sessionProjectById: buildAiVaultSessionProjectById({
      folderWorkspaces,
      repos,
      worktrees,
      projectHostSetupProjection,
      sessions
    })
  }
}

/** Separate attribution from active workspace state so memoized maps survive workspace switches. */
export function buildAiVaultSessionProjectById({
  folderWorkspaces = [],
  repos,
  worktrees,
  projectHostSetupProjection,
  sessions
}: Omit<ProjectResolverArgs, 'activeRepo' | 'activeWorktree'>): Map<string, AiVaultSessionProject> {
  const repoById = new Map(repos.map((repo) => [repo.id, repo]))
  const setupByRepoId = buildSetupByRepoId(projectHostSetupProjection.setups)
  const projectLabelByKey = buildProjectLabelByKey(repos, projectHostSetupProjection)
  const candidates = buildProjectCandidates(
    worktrees,
    projectHostSetupProjection,
    repoById,
    setupByRepoId
  )
  const sessionProjectById = new Map<string, AiVaultSessionProject>()
  const projectsByHostAndCwd = new Map<
    ExecutionHostId | null,
    Map<string | null, AiVaultSessionProject>
  >()
  for (const session of sessions) {
    const host = normalizeExecutionHostId(session.executionHostId)
    const owned = resolveStructuredAiVaultSessionProject(
      session,
      candidates,
      folderWorkspaces,
      projectLabelByKey
    )
    if (owned) {
      sessionProjectById.set(session.id, owned)
      continue
    }
    let projectsByCwd = projectsByHostAndCwd.get(host)
    if (!projectsByCwd) {
      projectsByCwd = new Map()
      projectsByHostAndCwd.set(host, projectsByCwd)
    }
    const cwdKey = aiVaultSessionProjectCwdKey(session)
    let project = projectsByCwd.get(cwdKey)
    if (!project) {
      project = resolveSessionProject(session, candidates, projectLabelByKey)
      projectsByCwd.set(cwdKey, project)
    }
    sessionProjectById.set(session.id, { ...project })
  }
  return sessionProjectById
}

function buildSetupByRepoId(
  setups: readonly ProjectHostSetup[]
): ReadonlyMap<string, ProjectHostSetup> {
  const setupByRepoId = new Map<string, ProjectHostSetup>()
  for (const setup of setups) {
    if (setup.repoId && !setupByRepoId.has(setup.repoId)) {
      setupByRepoId.set(setup.repoId, setup)
    }
  }
  return setupByRepoId
}

function buildProjectLabelByKey(
  repos: readonly Repo[],
  projection: ProjectHostSetupProjection
): Map<string, string> {
  const labels = new Map<string, string>()
  const projectLabelById = new Map(
    projection.projects.map((project) => [project.id, project.displayName])
  )

  for (const project of projection.projects) {
    const key = toAiVaultProjectKey(project.id, project.sourceRepoIds[0])
    if (key && !key.startsWith('repo:')) {
      labels.set(key, project.displayName)
    }
  }

  for (const repo of repos) {
    labels.set(`repo:${repo.id}`, repo.displayName)
  }

  for (const setup of projection.setups) {
    const key = toAiVaultProjectKey(setup.projectId, setup.repoId)
    if (key && !labels.has(key)) {
      labels.set(key, projectLabelById.get(setup.projectId) ?? setup.displayName)
    }
  }

  return labels
}

function buildProjectCandidates(
  worktrees: readonly Worktree[],
  projection: ProjectHostSetupProjection,
  repoById: ReadonlyMap<string, Repo>,
  setupByRepoId: ReadonlyMap<string, ProjectHostSetup>
): SessionProjectCandidate[] {
  const candidates: SessionProjectCandidate[] = []
  const setupRepoIds = new Set<string>()

  for (const worktree of worktrees) {
    if (!hasCandidatePath(worktree.path)) {
      continue
    }
    const repo = repoById.get(worktree.repoId)
    const setup = setupByRepoId.get(worktree.repoId)
    candidates.push(
      makeProjectCandidate({
        source: 'worktree',
        workspaceId: worktree.id,
        path: worktree.path,
        hostKey: resolveCandidateHostId(
          worktree.hostId,
          setup?.hostId,
          repo ? getRepoExecutionHostId(repo) : null
        ),
        projectId: worktree.projectId ?? setup?.projectId ?? null,
        repoId: worktree.repoId
      })
    )
  }

  for (const setup of projection.setups) {
    if (setup.repoId) {
      if (hasCandidatePath(setup.path)) {
        setupRepoIds.add(setup.repoId)
      }
    }
    if (!hasCandidatePath(setup.path)) {
      continue
    }
    candidates.push(
      makeProjectCandidate({
        source: 'setup',
        path: setup.path,
        hostKey: resolveCandidateHostId(setup.hostId, getRepoExecutionHostId(setup)),
        projectId: setup.projectId,
        repoId: setup.repoId || null
      })
    )
  }

  for (const repo of repoById.values()) {
    if (setupRepoIds.has(repo.id)) {
      continue
    }
    if (!hasCandidatePath(repo.path)) {
      continue
    }
    candidates.push(
      makeProjectCandidate({
        source: 'setup',
        path: repo.path,
        hostKey: getRepoExecutionHostId(repo),
        projectId: null,
        repoId: repo.id
      })
    )
  }

  return candidates
}

function makeProjectCandidate(
  fields: Omit<SessionProjectCandidate, 'normalizedPath' | 'ownsNormalizedCwd'> & { path: string }
): SessionProjectCandidate {
  const { path, ...rest } = fields
  const normalizedPath = normalizeRuntimePathForComparison(path)
  return {
    ...rest,
    normalizedPath,
    ownsNormalizedCwd: createNormalizedAiVaultScopeCwdMatcher([path])
  }
}

function resolveCandidateHostId(
  ...values: readonly (string | null | undefined)[]
): ExecutionHostId {
  for (const value of values) {
    const hostId = normalizeExecutionHostId(value)
    if (hostId) {
      return hostId
    }
  }
  return LOCAL_EXECUTION_HOST_ID
}

function hasCandidatePath(pathValue: string): boolean {
  return pathValue.trim().length > 0
}

function resolveSessionProject(
  session: AiVaultSession,
  candidates: readonly SessionProjectCandidate[],
  projectLabelByKey: ReadonlyMap<string, string>
): AiVaultSessionProject {
  const cwd = session.cwd
  if (!cwd) {
    return { kind: 'unknown', key: 'unknown', label: '' }
  }

  const matches = matchAiVaultProjectCandidates(session, cwd, candidates, compareCandidates)
  const sessionHostId = normalizeExecutionHostId(session.executionHostId)
  const hostMatches = sessionHostId
    ? matches.filter((candidate) => candidate.hostKey === sessionHostId)
    : matches
  if (sessionHostId && matches.length > 0 && hostMatches.length === 0) {
    // Why: same-path projects can exist on several hosts; a tagged transcript
    // should never be attributed to a project on a different machine.
    return aiVaultFolderProject(cwd)
  }

  const hostBuckets = new Set(hostMatches.map((candidate) => candidate.hostKey))
  if (!sessionHostId && hostBuckets.size > 1) {
    return aiVaultFolderProject(cwd)
  }

  const bestCandidate = hostMatches[0]
  if (!bestCandidate) {
    return aiVaultFolderProject(cwd)
  }

  return aiVaultCandidateProject(bestCandidate, projectLabelByKey)
}

function compareCandidates(left: SessionProjectCandidate, right: SessionProjectCandidate): number {
  const lengthDifference = right.normalizedPath.length - left.normalizedPath.length
  if (lengthDifference !== 0) {
    return lengthDifference
  }
  if (left.source === right.source) {
    return 0
  }
  return left.source === 'worktree' ? -1 : 1
}
