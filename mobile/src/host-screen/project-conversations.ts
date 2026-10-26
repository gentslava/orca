import {
  conversationPreferenceKey,
  type ConversationPreferences
} from '../../../src/shared/conversation-navigation-preferences'
import {
  projectConversationTitle,
  isGenericConversationTitle
} from '../../../src/shared/project-conversation-list'
import type { ProjectPreference } from '../../../src/shared/personal-project-order'
import { resolveProjectPreferenceKey } from '../../../src/shared/project-preference-identity'
import {
  buildProjectGroupingIndex,
  getProjectGroupingForRepo
} from '../../../src/shared/project-section-grouping'
import type { ProjectSectionCatalog } from '../worktree/workspace-list-sections'
import { isPathInsideOrEqual } from '../../../src/shared/cross-platform-path'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../src/shared/execution-host'
import { structuredAgentSessionPaneKey } from '../../../src/shared/structured-agent-session-projection'
import { agentDotState, agentRowTimeAt, type AgentDotState } from '../worktree/agent-row-display'
import { getWorktreeRowIdentity } from '../worktree/worktree-host-row-identity'
import { orderProjectConversations } from './project-conversation-order'
import type { SectionRepo, Worktree } from '../worktree/workspace-list-types'

export { readConversationHistory, readConversationTabs } from './conversation-records'
export type { ConversationHistory, ConversationTab } from './conversation-records'
import type { ConversationHistory, ConversationTab } from './conversation-records'

export type ConversationRow = {
  key: string
  title: string
  agent: string | null
  status: AgentDotState | 'saved' | 'transcript'
  at: number
  workspace: Worktree
  paneKey?: string
  preferenceKey?: string
  history?: ConversationHistory
}
export type ConversationProject = {
  key: string
  title: string
  hostId: ExecutionHostId
  hostLabel?: string
  hostHealthLabel?: string
  repo?: SectionRepo
  projectPreference?: ProjectPreference
  workspaces: Worktree[]
  data: ConversationRow[]
}

export function conversationTitle(
  values: readonly (string | null | undefined)[],
  workspace: Worktree,
  untitled: string
): string {
  return (
    values
      .map((value) => value?.trim())
      .find(
        (value) =>
          value &&
          !isGenericConversationTitle(value) &&
          value !== workspace.branch &&
          value !== workspace.path &&
          value !== workspace.displayName
      ) ?? untitled
  )
}

export function projectConversationTarget(project: ConversationProject): Worktree | null {
  return (
    project.workspaces.find(
      (workspace) => workspace.isMainWorktree || workspace.workspaceKind === 'folder-workspace'
    ) ?? (project.workspaces.length === 1 ? project.workspaces[0] : null)
  )
}

export function buildProjectConversations(args: {
  workspaces: readonly Worktree[]
  repos: readonly SectionRepo[]
  tabs: ReadonlyMap<string, readonly ConversationTab[]>
  history: readonly ConversationHistory[]
  now: number
  untitled: string
  query?: string
  projectCatalog?: ProjectSectionCatalog
  preferences?: ConversationPreferences
  archived?: boolean
}): ConversationProject[] {
  const projects = new Map<string, ConversationProject>()
  const hostOf = (workspace: Worktree) => workspace.hostId ?? workspace.hostContextHostId ?? 'local'
  const catalog = args.projectCatalog
  const repos = catalog?.repos ?? args.repos
  const repoMap = new Map(repos.map((repo) => [repo.id, repo]))
  const projectIndex = buildProjectGroupingIndex(catalog?.grouping ?? undefined)
  const groupingFor = (hostId: ExecutionHostId, repoId: string) => {
    const repo = repos.find((repo) => repo.id === repoId && getRepoExecutionHostId(repo) === hostId)
    return getProjectGroupingForRepo(repoId, repoMap, projectIndex, repo)
  }
  const projectKey = (hostId: ExecutionHostId, repoId: string) =>
    `${hostId}\0${groupingFor(hostId, repoId).key}`
  for (const repo of repos) {
    const hostId = getRepoExecutionHostId(repo)
    const key = projectKey(hostId, repo.id)
    if (projects.has(key)) {
      continue
    }
    const preferenceKey = catalog?.grouping
      ? resolveProjectPreferenceKey(repo.id, catalog.grouping.projectHostSetups, hostId)
      : null
    projects.set(key, {
      key,
      title: groupingFor(hostId, repo.id).label,
      hostId,
      repo,
      projectPreference: preferenceKey
        ? (catalog?.grouping?.personalProjectOrder?.projects[preferenceKey] ?? {})
        : undefined,
      workspaces: [],
      data: []
    })
  }
  for (const workspace of args.workspaces) {
    const hostId = hostOf(workspace)
    const key = projectKey(hostId, workspace.repoId)
    let project = projects.get(key)
    if (!project) {
      project = { key, title: workspace.repo, hostId, workspaces: [], data: [] }
      projects.set(key, project)
    }
    project.hostLabel ??= workspace.hostContextLabel
    project.hostHealthLabel ??= workspace.hostContextHealthLabel
    project.workspaces.push(workspace)
    const agents = (workspace.agents ?? []).filter((agent) => !agent.parentPaneKey)
    const used = new Set<string>()
    for (const tab of args.tabs.get(getWorktreeRowIdentity(workspace)) ?? []) {
      const paneKey =
        tab.type === 'agent-session' && tab.sessionId
          ? structuredAgentSessionPaneKey(tab.id, tab.sessionId)
          : tab.leafId
            ? `${tab.parentTabId ?? tab.id}:${tab.leafId}`
            : (tab.terminal ?? tab.id)
      const agent = workspace.agents?.find((agent) => agent.paneKey === paneKey)
      if (agent?.parentPaneKey) {
        continue
      }
      const agentType =
        tab.agent ?? tab.launchAgent ?? tab.agentStatus?.agentType ?? agent?.agentType
      if (tab.type === 'terminal' && !agentType && !agent) {
        continue
      }
      used.add(paneKey)
      const saved = args.history.find(
        (session) =>
          session.executionHostId === hostId &&
          (tab.sessionId
            ? session.structuredSession?.sessionId === tab.sessionId
            : session.sessionId === tab.agentStatus?.sessionId)
      )
      if (saved?.conversationContent === 'empty') {
        continue
      }
      project.data.push({
        key: `${key}\0${workspace.worktreeId}\0${tab.sessionId ?? paneKey}`,
        title: conversationTitle(
          [agent?.taskTitle, agent?.prompt, saved ? projectConversationTitle(saved) : tab.title],
          workspace,
          args.untitled
        ),
        agent: agentType ?? null,
        status: agent ? agentDotState(agent, args.now) : 'idle',
        at: agent ? agentRowTimeAt(agent) : 0,
        workspace,
        paneKey,
        history: saved,
        preferenceKey: saved
          ? conversationPreferenceKey({ ...saved, executionHostId: hostId })
          : tab.sessionId
            ? conversationPreferenceKey({
                executionHostId: hostId,
                agent: agentType ?? '',
                sessionId: tab.sessionId,
                structuredSession: { sessionId: tab.sessionId, workspaceId: workspace.worktreeId }
              })
            : undefined
      })
    }
    for (const agent of agents) {
      if (used.has(agent.paneKey)) {
        continue
      }
      project.data.push({
        key: `${key}\0${workspace.worktreeId}\0${agent.paneKey}`,
        title: conversationTitle([agent.taskTitle, agent.prompt], workspace, args.untitled),
        agent: agent.agentType,
        status: agentDotState(agent, args.now),
        at: agentRowTimeAt(agent),
        workspace,
        paneKey: agent.paneKey
      })
    }
  }
  for (const session of args.history) {
    if (!session.executionHostId || session.subagent || session.conversationContent === 'empty') {
      continue
    }
    const workspace = args.workspaces
      .filter((workspace) => hostOf(workspace) === session.executionHostId)
      .filter((workspace) =>
        session.structuredSession
          ? session.structuredSession.workspaceId === workspace.worktreeId
          : session.cwd && isPathInsideOrEqual(workspace.path, session.cwd)
      )
      .sort((a, b) => b.path.length - a.path.length)[0]
    if (!workspace) {
      continue
    }
    const project = projects.get(projectKey(hostOf(workspace), workspace.repoId))
    if (!project) {
      continue
    }
    const sessionId = session.structuredSession?.sessionId
    const tab = (args.tabs.get(getWorktreeRowIdentity(workspace)) ?? []).find((tab) =>
      sessionId ? tab.sessionId === sessionId : tab.agentStatus?.sessionId === session.sessionId
    )
    if (tab) {
      continue
    }
    const key = `${project.key}\0history\0${sessionId ?? session.id}`
    if (project.data.some((row) => row.key === key)) {
      continue
    }
    project.data.push({
      key,
      title: conversationTitle([projectConversationTitle(session)], workspace, args.untitled),
      agent: session.agent,
      status: sessionId ? 'saved' : 'transcript',
      at: Date.parse(session.updatedAt ?? session.modifiedAt) || 0,
      workspace,
      history: session,
      preferenceKey: conversationPreferenceKey({
        ...session,
        executionHostId: session.executionHostId
      })
    })
  }
  return orderProjectConversations(projects.values(), args)
}
