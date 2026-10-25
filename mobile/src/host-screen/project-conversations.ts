import { z } from 'zod'
import { isPathInsideOrEqual } from '../../../src/shared/cross-platform-path'
import {
  getRepoExecutionHostId,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../../src/shared/execution-host'
import { structuredAgentSessionPaneKey } from '../../../src/shared/structured-agent-session-projection'
import { agentDotState, agentRowTimeAt, type AgentDotState } from '../worktree/agent-row-display'
import { getWorktreeRowIdentity } from '../worktree/worktree-host-row-identity'
import type { SectionRepo, Worktree } from '../worktree/workspace-list-types'

const historySchema = z.looseObject({
  id: z.string(),
  executionHostId: z.string().transform((value) => normalizeExecutionHostId(value)),
  sessionId: z.string(),
  agent: z.string(),
  title: z.string(),
  cwd: z.string().nullable(),
  updatedAt: z.string().nullable(),
  modifiedAt: z.string(),
  model: z.string().nullable().optional(),
  subagent: z.unknown().optional(),
  structuredSession: z.object({ sessionId: z.string(), workspaceId: z.string() }).optional()
})
export type ConversationHistory = z.infer<typeof historySchema>
const historyListSchema = z.object({
  sessions: z.array(historySchema),
  includesStructuredSessions: z.literal(true).optional()
})
export function readConversationHistory(value: unknown) {
  return historyListSchema.parse(value)
}

const tabSchema = z.object({
  type: z.enum(['terminal', 'agent-session']),
  id: z.string(),
  title: z.string(),
  sessionId: z.string().optional(),
  agent: z.string().optional(),
  terminal: z.string().nullable().optional(),
  launchAgent: z.string().optional(),
  parentTabId: z.string().optional(),
  leafId: z.string().optional(),
  agentStatus: z
    .object({
      agentType: z.string().nullable().optional(),
      sessionId: z.string().nullable().optional()
    })
    .nullable()
    .optional()
})
export type ConversationTab = z.infer<typeof tabSchema>
export function readConversationTabs(value: unknown): ConversationTab[] {
  return z
    .object({ tabs: z.array(z.unknown()) })
    .parse(value)
    .tabs.flatMap((tab) => {
      const parsed = tabSchema.safeParse(tab)
      return parsed.success ? [parsed.data] : []
    })
}

export type ConversationRow = {
  key: string
  title: string
  agent: string | null
  status: AgentDotState | 'saved' | 'transcript'
  at: number
  workspace: Worktree
  paneKey?: string
  history?: ConversationHistory
}
export type ConversationProject = {
  key: string
  title: string
  hostId: ExecutionHostId
  hostLabel?: string
  hostHealthLabel?: string
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
}): ConversationProject[] {
  const projects = new Map<string, ConversationProject>()
  const hostOf = (workspace: Worktree) => workspace.hostId ?? workspace.hostContextHostId ?? 'local'
  const projectKey = (hostId: ExecutionHostId, repoId: string) => `${hostId}\0${repoId}`
  for (const repo of args.repos) {
    const hostId = getRepoExecutionHostId(repo)
    const key = projectKey(hostId, repo.id)
    projects.set(key, { key, title: repo.displayName, hostId, workspaces: [], data: [] })
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
      project.data.push({
        key: `${key}\0${workspace.worktreeId}\0${tab.sessionId ?? paneKey}`,
        title: conversationTitle(
          [agent?.taskTitle, agent?.prompt, tab.title],
          workspace,
          args.untitled
        ),
        agent: agentType ?? null,
        status: agent ? agentDotState(agent, args.now) : 'idle',
        at: agent ? agentRowTimeAt(agent) : 0,
        workspace,
        paneKey,
        ...(tab.sessionId
          ? {
              history: args.history.find(
                (session) =>
                  session.executionHostId === hostId &&
                  session.structuredSession?.sessionId === tab.sessionId
              )
            }
          : {})
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
    if (!session.executionHostId || session.subagent) {
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
      title: conversationTitle([session.title], workspace, args.untitled),
      agent: session.agent,
      status: sessionId ? 'saved' : 'transcript',
      at: Date.parse(session.updatedAt ?? session.modifiedAt) || 0,
      workspace,
      history: session
    })
  }
  const query = args.query?.trim().toLocaleLowerCase()
  return [...projects.values()]
    .map((project) => ({
      ...project,
      data: project.data
        .sort((a, b) => b.at - a.at)
        .filter(
          (row) =>
            !query ||
            `${project.title} ${row.title} ${row.agent ?? ''}`.toLocaleLowerCase().includes(query)
        )
    }))
    .filter(
      (project) =>
        !query || project.data.length > 0 || project.title.toLocaleLowerCase().includes(query)
    )
}
