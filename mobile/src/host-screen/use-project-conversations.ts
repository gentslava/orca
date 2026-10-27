import { AI_VAULT_CANONICAL_PROJECT_SEARCH_CAPABILITY } from '../../../src/shared/ai-vault-runtime-capabilities'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { ExecutionHostId } from '../../../src/shared/execution-host'
import {
  rpcClientForExecutionHost,
  reachableServerClients
} from '../transport/execution-host-scoped-rpc-client'
import { getWorktreeRowIdentity } from '../worktree/worktree-host-row-identity'
import { resolveWorktreeHostId } from '../worktree/worktree-host-context-labels'
import {
  agentHistoryHostStatusRead,
  agentHistorySessionScan
} from '../agent-history/mobile-agent-history-operations'
import { sessionTabsListRead } from '../session/mobile-session-read-operations'
import type { HostScreenController } from './use-host-screen-controller'
import {
  readConversationHistory,
  readConversationTabs,
  type ConversationHistory,
  type ConversationTab
} from './project-conversations'

type ConversationSnapshot = {
  tabs: Map<string, ConversationTab[]>
  history: ConversationHistory[]
  capabilities: Map<ExecutionHostId, readonly string[]>
  complete: boolean
  failed: boolean
}
const EMPTY: ConversationSnapshot = {
  tabs: new Map(),
  history: [],
  capabilities: new Map(),
  complete: false,
  failed: false
}

type LoadedConversations = {
  client: RpcClient
  hostId: string | undefined
  generation: number
  authority: string
  workspaceStamp: string
  at: number
  value: ConversationSnapshot
}

const snapshots = new WeakMap<RpcClient, LoadedConversations>()
const REFRESH_MS = 15_000

export type ProjectConversationsSource = Pick<
  HostScreenController,
  'client' | 'hostId' | 'connState' | 'displayWorktrees' | 'hostCapabilities'
> & {
  state: Pick<HostScreenController['state'], 'serverWorkspaces' | 'repoHostIdByRepoId'>
  catalog: Pick<HostScreenController['catalog'], 'onRefresh'>
}

export function useProjectConversations(controller: ProjectConversationsSource) {
  const { client, hostId, connState, displayWorktrees, hostCapabilities, state } = controller
  const subscribe = useCallback(
    (onChange: () => void) => client?.onStateChange(onChange) ?? (() => {}),
    [client]
  )
  const readGeneration = useCallback(() => client?.getGeneration?.() ?? 0, [client])
  const generation = useSyncExternalStore(subscribe, readGeneration, readGeneration)
  const workspaces = useMemo(
    () =>
      displayWorktrees.map((workspace) => ({
        ...workspace,
        hostId: resolveWorktreeHostId(workspace, state.repoHostIdByRepoId)
      })),
    [displayWorktrees, state.repoHostIdByRepoId]
  )
  const workspacesRef = useRef(workspaces)
  workspacesRef.current = workspaces
  const workspaceStamp = workspaces.map(getWorktreeRowIdentity).sort().join('\0')
  const serversRef = useRef(state.serverWorkspaces.hosts)
  serversRef.current = state.serverWorkspaces.hosts
  const serverStamp = state.serverWorkspaces.hosts
    .map((host) => `${host.hostId}:${host.relay}`)
    .join('\0')
  const sources = useMemo(() => {
    const servers = reachableServerClients(client, hostCapabilities, serversRef.current)
    return client ? new Map([['local' as const, client], ...servers]) : servers
  }, [client, hostCapabilities, serverStamp])
  const authority = JSON.stringify([hostCapabilities, serverStamp])
  const cached = client ? snapshots.get(client) : undefined
  const belongsHere = (entry: LoadedConversations | null | undefined) =>
    entry?.client === client &&
    entry.hostId === hostId &&
    entry.generation === generation &&
    entry.authority === authority
  const [loaded, setLoaded] = useState<LoadedConversations | null>(null)
  const retained = belongsHere(loaded) ? loaded : belongsHere(cached) ? cached : null
  const [refreshing, setRefreshing] = useState(false)
  const [revision, setRevision] = useState(0)
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setRevision((value) => value + 1)
    void controller.catalog.onRefresh()
  }, [controller.catalog.onRefresh])

  useEffect(() => {
    if (!client || connState !== 'connected') {
      return
    }
    let stale = false
    let running = false
    let firstRefresh = true
    const cached = snapshots.get(client)
    const fresh =
      cached !== undefined &&
      cached.hostId === hostId &&
      cached.generation === generation &&
      cached.authority === authority &&
      cached.workspaceStamp === workspaceStamp &&
      !cached.value.failed &&
      Date.now() - cached.at < REFRESH_MS
    const current = () => !stale && generation === (client.getGeneration?.() ?? 0)
    const refresh = async () => {
      if (running) {
        return
      }
      running = true
      const force = firstRefresh && revision > 0
      firstRefresh = false
      const failedSources = new Set<ExecutionHostId>()
      const failedTabs = new Set<string>()
      const next: ConversationSnapshot = {
        tabs: new Map(),
        history: [],
        capabilities: new Map(),
        complete: true,
        failed: false
      }
      try {
        const historyRequests = Promise.all(
          [...sources].map(async ([sourceHost, sourceClient]) => {
            try {
              const status = agentHistoryHostStatusRead.interpret(
                await agentHistoryHostStatusRead.request(sourceClient)
              )
              next.capabilities.set(sourceHost, status.capabilities ?? [])
              if (!status.capabilities?.includes('aiVault.v1')) {
                next.complete = false
                return
              }
              const reply = await agentHistorySessionScan.request(sourceClient, {
                ...(status.capabilities.includes(AI_VAULT_CANONICAL_PROJECT_SEARCH_CAPABILITY)
                  ? { historyOwnership: {} }
                  : {}),
                unlimited: true,
                includeAntigravityIdeSessions: true,
                includeStructuredSessions: true,
                force
              })
              const history = readConversationHistory(agentHistorySessionScan.interpret(reply))
              if (!history.includesStructuredSessions) {
                next.complete = false
              }
              next.history.push(
                ...history.sessions.map((session) => ({
                  ...session,
                  executionHostId:
                    sourceHost !== 'local' && session.executionHostId === 'local'
                      ? sourceHost
                      : session.executionHostId
                }))
              )
            } catch {
              failedSources.add(sourceHost)
              next.failed = true
              next.complete = false
            }
          })
        )
        const workspaces = workspacesRef.current
        for (let offset = 0; offset < workspaces.length && current(); offset += 4) {
          await Promise.all(
            workspaces.slice(offset, offset + 4).map(async (workspace) => {
              const rowClient = rpcClientForExecutionHost(
                client,
                hostCapabilities,
                workspace.hostId
              )
              if (!rowClient) {
                return
              }
              try {
                const result = sessionTabsListRead.interpret(
                  await sessionTabsListRead.request(rowClient, {
                    worktree: `id:${workspace.worktreeId}`
                  })
                )
                next.tabs.set(getWorktreeRowIdentity(workspace), readConversationTabs(result))
              } catch {
                failedTabs.add(getWorktreeRowIdentity(workspace))
                next.failed = true
              }
            })
          )
        }
        await historyRequests
        if (current()) {
          const previous = snapshots.get(client)
          const value = (() => {
            const tabs = new Map(next.tabs)
            const capabilities = new Map(next.capabilities)
            let history = next.history
            if (
              previous?.client === client &&
              previous.hostId === hostId &&
              previous.generation === generation &&
              previous.authority === authority
            ) {
              for (const source of failedSources) {
                const retained = previous.value.capabilities.get(source)
                if (!capabilities.has(source) && retained) {
                  capabilities.set(source, retained)
                }
              }
              for (const key of failedTabs) {
                const retained = previous.value.tabs.get(key)
                if (retained) {
                  tabs.set(key, retained)
                }
              }
              history = [
                ...history,
                ...previous.value.history.filter(
                  (session) =>
                    session.executionHostId &&
                    failedSources.has(
                      session.executionHostId.startsWith('runtime:')
                        ? session.executionHostId
                        : 'local'
                    )
                )
              ]
            }
            return { ...next, tabs, capabilities, history }
          })()
          const loaded = {
            client,
            hostId,
            generation,
            authority,
            workspaceStamp,
            at: Date.now(),
            value
          }
          snapshots.set(client, loaded)
          setLoaded(loaded)
        }
      } finally {
        running = false
        if (current()) {
          setRefreshing(false)
        }
      }
    }
    if (!fresh || revision > 0) {
      void refresh()
    }
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      stale = true
      clearInterval(timer)
    }
  }, [
    client,
    connState,
    hostId,
    generation,
    sources,
    workspaceStamp,
    hostCapabilities,
    revision,
    authority
  ])

  const snapshot = retained?.value ?? EMPTY
  return {
    ...snapshot,
    generation,
    workspaces,
    refreshing,
    onRefresh,
    loading: snapshot === EMPTY && connState === 'connected',
    capabilitiesFor: (host: ExecutionHostId) =>
      snapshot.capabilities.get(host.startsWith('runtime:') ? host : 'local') ?? []
  }
}
