import { afterEach, describe, expect, it } from 'vitest'
import type { AgentSessionRecord } from '../../shared/agent-session-record'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from '../../shared/agent-session-record.test-fixture'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import type { AiVaultListResult } from '../../shared/ai-vault-types'
import { filterAiVaultSessions } from '../../shared/ai-vault-session-filters'
import { setStructuredAgentSessionHost } from '../native-chat/agent-session-wire/structured-agent-session-registry'
import {
  OPENS_EVERY_STRUCTURED_CHAT,
  projectStructuredAiVaultSessions
} from './structured-session-ownership'
import { listResult } from './structured-session-ownership.test-support'
import { parseAiVaultListResult } from './session-list-result-validation'
import { restampAiVaultListResult } from './session-list-results'
import { aiVaultOrchestrationChildSessionIds } from './structured-conversation-navigation'
import { OrchestrationDb } from '../runtime/orchestration/db'
import { testOrcaSessionId } from '../../shared/orca-session-address-test-fixture'
import {
  mintStructuredWorkerHandle,
  mintStructuredWorkerPaneKey,
  structuredWorkerProcessIncarnation
} from '../runtime/structured-worker-identity'

const EMPTY: AiVaultListResult = { sessions: [], issues: [], scannedAt: '2026-10-25T00:00:00Z' }

function install(records: readonly AgentSessionRecord[]): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: list projection reads only the durable catalog on this host.
  setStructuredAgentSessionHost({ deps: { store: { listRecords: () => records } } } as never)
}

function retained(provider = 'claude'): AgentSessionRecord {
  const record = agentSessionRecordFixture(
    agentSessionLeaseFixture({
      claimStatus: 'released',
      ownerProcess: null,
      provenHandleLinkId: null
    })
  )
  return {
    ...record,
    provider,
    providerHandleChain: [],
    location: { ...record.location, workspaceId: 'folder:notes', workspaceKind: 'folder' },
    launchDirectory: '/notes',
    conversationName: 'Saved conversation',
    createdAt: Date.parse('2026-10-23T00:00:00Z'),
    updatedAt: Date.parse('2026-10-24T12:00:00Z')
  }
}

afterEach(() => setStructuredAgentSessionHost(null))

describe('primary conversation navigation from the durable session catalog', () => {
  it('keeps released worker journals inside the parent using existing orchestration custody records', () => {
    const db = new OrchestrationDb(':memory:')
    try {
      const parent = testOrcaSessionId('4a1f6c2e-8b3d-4e7a-9c15-0d2b6e8f1a37')
      const worker = testOrcaSessionId('7e3b9d15-2c4a-4f86-a0b1-5c9e2d7f3b64')
      const run = db.createRun({
        objective: 'Inspect',
        coordinatorHandle: null,
        coordinatorPaneKey: null,
        coordinatorOrcaSessionId: parent
      })
      const started = db.createStartingWorkerDispatch({
        taskSpec: 'Worker',
        taskRunId: run.id,
        startOptions: {},
        creator: { kind: 'session', orcaSessionId: parent },
        maxDepth: 10
      })
      db.prepareStartingWorkerAuthority({
        dispatchId: started.dispatch.id,
        handle: mintStructuredWorkerHandle(),
        paneKey: mintStructuredWorkerPaneKey(worker),
        processIncarnation: structuredWorkerProcessIncarnation(worker),
        worktreeId: 'folder:notes',
        effects: [],
        setupState: 'ready',
        terminalOwnership: 'created'
      })
      db.markWorkerDispatchReady(started.dispatch.id)
      db.settleWorkerReport({
        taskId: started.task.id,
        dispatchId: started.dispatch.id,
        outcome: 'succeeded',
        result: 'Done'
      })
      const resource = db.getWorkerTerminalResourceByOwner(started.dispatch.id)!
      db.settleDeadWorkerTerminalRelease({
        requestingDispatchId: started.dispatch.id,
        resourceId: resource.id,
        processIncarnation: resource.process_incarnation!
      })
      const successor = testOrcaSessionId('561bb50e-6281-43a7-a761-4e15dc4c730a')
      const records: AgentSessionRecord[] = [parent, worker, successor].map((sessionId) => ({
        ...retained(),
        sessionId
      }))
      records[1]!.conversationCommand = {
        command: 'clear',
        state: 'completed',
        phase: 'committed',
        operationId: 'clear-worker',
        callerKey: 'worker',
        replacementSessionId: successor
      }
      install(records)
      expect(
        projectStructuredAiVaultSessions(EMPTY, OPENS_EVERY_STRUCTURED_CHAT, {
          includeStructuredSessions: true,
          childSessionIds: aiVaultOrchestrationChildSessionIds(db)
        }).sessions.map((row) => row.structuredSession?.sessionId)
      ).toEqual([parent])
    } finally {
      db.close()
    }
  })
  it.each(['claude', 'codex', 'gemini'])(
    'retains an empty %s chat without a provider handle or file, without changing transcript browsing',
    (provider) => {
      const record = retained(provider)
      install([record])
      expect(projectStructuredAiVaultSessions(EMPTY, OPENS_EVERY_STRUCTURED_CHAT)).toBe(EMPTY)
      const result = projectStructuredAiVaultSessions(EMPTY, OPENS_EVERY_STRUCTURED_CHAT, {
        includeStructuredSessions: true
      })
      expect(result.sessions).toEqual([
        expect.objectContaining({
          source: 'structured-record',
          agent: provider,
          title: record.conversationName,
          cwd: '/notes',
          filePath: '',
          resumeCommand: '',
          createdAt: '2026-10-23T00:00:00.000Z',
          updatedAt: '2026-10-24T12:00:00.000Z',
          structuredSession: { sessionId: record.sessionId, workspaceId: 'folder:notes' }
        })
      ])
      const filters = {
        query: '',
        agents: [result.sessions[0]!.agent],
        scope: 'all' as const,
        sort: 'updated' as const,
        activeWorktreePaths: [],
        hideEmptySessions: true
      }
      expect(filterAiVaultSessions(result.sessions, filters)).toEqual([])
      expect(
        filterAiVaultSessions(result.sessions, { ...filters, preserveStructuredSessions: true })
      ).toEqual(result.sessions)
      expect(
        projectStructuredAiVaultSessions(EMPTY, () => false, { includeStructuredSessions: true })
          .sessions
      ).toEqual([])
      expect(
        parseAiVaultListResult(restampAiVaultListResult(result, 'runtime:remote')).sessions[0]
      ).toMatchObject({
        source: 'structured-record',
        executionHostId: 'runtime:remote',
        structuredSession: { sessionId: record.sessionId }
      })
    }
  )

  it('deduplicates all provider handles and duplicate files by stored chat while preserving another host', () => {
    const record = retained()
    record.providerHandleChain = ['provider-first', 'provider-latest'].map((id, index) => ({
      linkId: `link-${index}`,
      origin: 'created',
      mintedAtFence: index + 1,
      observedAt: index + 1,
      handle: claudeProviderHandle(id, null)
    }))
    install([record])
    const base = listResult().sessions[0]!
    const files = record.providerHandleChain.map((link, index) => ({
      ...base,
      agent: 'claude' as const,
      sessionId: index === 0 ? 'provider-first' : 'provider-latest',
      id: `file-${index}`,
      filePath: `/transcripts/${link.linkId}.jsonl`,
      updatedAt: new Date(record.updatedAt + index).toISOString()
    }))
    const remote = { ...files[0]!, id: 'remote', executionHostId: 'runtime:remote' as const }
    const result = projectStructuredAiVaultSessions(
      { ...EMPTY, sessions: [...files, remote] },
      OPENS_EVERY_STRUCTURED_CHAT,
      { includeStructuredSessions: true }
    )
    expect(result.sessions).toHaveLength(2)
    expect(result.sessions.find((row) => row.executionHostId === 'local')).toMatchObject({
      id: 'file-1',
      filePath: '/transcripts/link-1.jsonl',
      title: 'Saved conversation',
      structuredSession: { sessionId: record.sessionId }
    })
    expect(result.sessions.find((row) => row.executionHostId === 'runtime:remote')).toBe(remote)
  })

  it('never imports another execution host or WSL namespace and omits orchestration children', () => {
    const local = retained()
    const remote = {
      ...retained(),
      sessionId: 'remote-chat',
      location: { ...local.location, executionHostId: 'runtime:remote' as const }
    }
    const wsl = {
      ...retained(),
      sessionId: 'wsl-chat',
      location: { ...local.location, wslDistro: 'Ubuntu' }
    }
    const child = { ...retained(), sessionId: 'released-child' }
    install([local, remote, wsl, child])
    expect(
      projectStructuredAiVaultSessions(EMPTY, OPENS_EVERY_STRUCTURED_CHAT, {
        includeStructuredSessions: true,
        childSessionIds: new Set([child.sessionId])
      }).sessions.map((row) => row.structuredSession?.sessionId)
    ).toEqual([local.sessionId])
  })

  it('reads live stored names and recency even when the provider scan stamp does not change', () => {
    const record = retained()
    install([record])
    const before = projectStructuredAiVaultSessions(EMPTY, OPENS_EVERY_STRUCTURED_CHAT, {
      includeStructuredSessions: true
    })
    record.conversationName = 'Renamed after closing'
    record.updatedAt += 1000
    const after = projectStructuredAiVaultSessions(EMPTY, OPENS_EVERY_STRUCTURED_CHAT, {
      includeStructuredSessions: true
    })
    expect(after.scannedAt).toBe(before.scannedAt)
    expect(after.sessions[0]?.title).toBe('Renamed after closing')
    expect(after.sessions[0]?.updatedAt).not.toBe(before.sessions[0]?.updatedAt)
  })
})
