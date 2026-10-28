// Background helpers outlive spawn/turn results; unrecorded work must remain visible and resist idle eviction.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computeAgentSessionPayloadFingerprint } from '../../../shared/agent-session-mutation-envelope'
import { readAgentJournalTurn } from '../../../shared/agent-session-turn-record'
import { isSubagentBlock } from '../../../shared/native-chat-types'
import { activeStructuredAgentSessionTurnId } from '../../../shared/structured-agent-session-live-turn'
import { acpChildWorkStatusSink } from '../../acp/acp-structured-child-work.test-support'
import {
  MOVED_TO_BACKGROUND,
  RESUMED_BY_MESSAGE
} from '../../claude/claude-captured-task-frames.test-fixture'
import { WAKES_AFTER_ITS_SHELL } from '../../claude/claude-captured-wake-frames.test-fixture'
import { ClaudeStructuredSessionAdapter } from '../../claude/claude-structured-session-adapter'
import {
  fakeClaude,
  PROVIDER_SESSION_ID,
  type FakeConnection
} from '../../claude/claude-structured-session-test-support'
import { claudeStartupSettled } from '../../claude/claude-structured-startup-settled-test-support'
import type { AgentSessionRecordStore } from '../../runtime/agent-session-record-store'
import { openTestAgentSessionRecordStore } from '../../runtime/agent-session-record-store-test-harness'
import { structuredClaudeLifecycleEvent } from '../../runtime/structured-claude-runtime-adapter'
import { claudeStructuredPermissionOptions } from '../../claude/claude-structured-launch-resolution'
import { openTestJournalHostDatabase } from '../agent-session-journal/journal-host-database-test-support'
import { StructuredAgentSessionHost } from './structured-agent-session-host'
import { STRUCTURED_AGENT_SESSION_IDLE_MS } from './structured-agent-session-idle-sweep'
import { claudeAndCodexAgents } from './structured-agent-session-adapter-router-test-support'
import { recordingStructuredAgentSessionLogger } from './structured-agent-session-logger-test-support'
import {
  HOST_TEST_NOW as NOW,
  HOST_TEST_SESSION as SESSION,
  hostTestAttachParams,
  hostTestMessage,
  hostTestOperationId,
  resetHostTestOperationIds
} from './structured-agent-session-host-test-data'

const CALLER = { callerKey: 'client-1' }
let claudeFrames: { replayUuid: null; initProof?: 'none' }

let root: string
let host: StructuredAgentSessionHost
let adapter: ClaudeStructuredSessionAdapter
let store: AgentSessionRecordStore
let claude: ReturnType<typeof fakeClaude>
let records: ReturnType<typeof acpChildWorkStatusSink>
let clock = NOW

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-claude-subagent-row-'))
  clock = NOW
  resetHostTestOperationIds()
  const log = recordingStructuredAgentSessionLogger()
  claudeFrames = { replayUuid: null }
  claude = fakeClaude(claudeFrames)
  adapter = new ClaudeStructuredSessionAdapter({
    resolveLaunch: async ({ permissionMode }) => ({
      pathToClaudeCodeExecutable: 'claude',
      options: claudeStructuredPermissionOptions(permissionMode ?? 'ask'),
      cwd: root,
      claudeConfigDir: join(root, 'claude-home'),
      providerSessionId: PROVIDER_SESSION_ID,
      resumeLeafUuid: null,
      resumesTranscript: (store.getRecord(SESSION)?.providerHandleChain.length ?? 0) > 0,
      continuesChain: (store.getRecord(SESSION)?.providerHandleChain.length ?? 0) > 0
    }),
    onEvent: (event) => {
      const mapped = structuredClaudeLifecycleEvent(event)
      if (mapped) {
        void host.handleAdapterEvent(mapped)
      }
    },
    onDispatchSettledLate: (settlement) => void host.settleLateDispatch(settlement),
    persistHandle: async () => undefined,
    logger: log.logger,
    onChildWorkEvidence: (sessionId, evidence, producer) =>
      host.publishChildWorkEvidence(sessionId, evidence, producer),
    openConnection: claude.openConnection,
    readProcessStartTime: async () => 1_700_000_000_000,
    now: () => clock
  })
  store = await openTestAgentSessionRecordStore(root)
  records = acpChildWorkStatusSink()
  host = new StructuredAgentSessionHost({
    agents: claudeAndCodexAgents(adapter),
    store,
    adapter: Object.assign(adapter, { supportsCreate: () => true }),
    journalDatabase: openTestJournalHostDatabase(root),
    claimKeyId: 'key-1',
    mintSpawnToken: () => 'spawn-a',
    logger: log.logger,
    statusSink: records.sink,
    now: () => clock
  })
  const params = hostTestAttachParams(null, {
    provider: 'claude',
    agent: 'claude',
    options: { model: 'haiku', permissionMode: 'auto' },
    accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: join(root, 'claude-home') },
    providerHandle: { kind: 'claude', sessionId: PROVIDER_SESSION_ID, leafUuid: null }
  })
  expect(await host.attach(CALLER, params)).toMatchObject({ ok: true })
  await claudeStartupSettled(adapter, SESSION)
})

afterEach(async () => {
  await adapter.closeAll()
  await host.flushAllStreamedEvents()
  await rm(root, { recursive: true, force: true })
})

function eventually<T>(assertion: () => T | Promise<T>): Promise<T> {
  return vi.waitFor(assertion, { timeout: 10_000 })
}

function frame(connection: FakeConnection, message: Record<string, unknown>): void {
  connection.handlers.onMessage?.({ session_id: PROVIDER_SESSION_ID, ...message })
}

function envelope(method: 'agentSession.send' | 'agentSession.cancel', fields: Fields) {
  return {
    sessionId: SESSION,
    clientOperationId: hostTestOperationId(),
    expectedRuntimeFence: store.getRecord(SESSION)!.lease.runtimeFence,
    payloadFingerprint: computeAgentSessionPayloadFingerprint({
      method,
      sessionId: SESSION,
      fields
    })
  }
}

type Fields = Parameters<typeof computeAgentSessionPayloadFingerprint>[0]['fields']

async function sendAndEcho(connection: FakeConnection, text: string): Promise<void> {
  const body = hostTestMessage(text)
  const sent = await host.send(CALLER, { envelope: envelope('agentSession.send', { body }), body })
  expect(sent.ok).toBe(true)
  await eventually(() =>
    expect(connection.sent.some((message) => JSON.stringify(message).includes(text))).toBe(true)
  )
  frame(connection, { type: 'system', subtype: 'init', uuid: 'init-1', model: 'claude-sonnet-5' })
  frame(connection, { ...connection.sent.at(-1)! })
}

async function savedRows() {
  await host.flushStreamedEvents(SESSION)
  return (await host.journalSnapshot(SESSION)).items.flatMap((item) =>
    item.body.kind === 'message' ? item.body.blocks.filter(isSubagentBlock) : []
  )
}

it("keeps a background helper's row working past its spawn result and its turn's end, until its own end", async () => {
  const connection = claude.connections[0]!
  await sendAndEcho(connection, 'Run it in the background.')
  // Replay through spawn and parent-turn completion, before the helper ends.
  for (const [index, captured] of RESUMED_BY_MESSAGE.filter(({ at }) => at <= 4_765).entries()) {
    frame(connection, { uuid: `launch-${index}`, ...captured.frame })
  }
  await eventually(async () => expect(await savedRows()).toHaveLength(1))
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(await savedRows()).toEqual([
    expect.objectContaining({ id: 'agent-1', state: 'working', background: true })
  ])
  const { items } = await host.journalSnapshot(SESSION)
  expect(activeStructuredAgentSessionTurnId(items)).toBeNull()
  expect(items.map((item) => readAgentJournalTurn(item.body)?.state)).toContain('completed')

  for (const [index, captured] of RESUMED_BY_MESSAGE.filter(
    ({ at }) => at > 4_765 && at <= 7_427
  ).entries()) {
    frame(connection, { uuid: `run-${index}`, ...captured.frame })
  }
  await eventually(async () =>
    expect(await savedRows()).toEqual([
      expect.objectContaining({ id: 'agent-1', state: 'completed', tokens: 15_971 })
    ])
  )
})

it("keeps an agent whose helper the store refused past idle cleanup, until the strip's Stop", async () => {
  records.sink.publishChildWork = () => undefined
  const connection = claude.connections[0]!
  await sendAndEcho(connection, 'Run it in the background.')
  for (const [index, captured] of RESUMED_BY_MESSAGE.filter(({ at }) => at <= 3_349).entries()) {
    frame(connection, { uuid: `launch-${index}`, ...captured.frame })
  }
  const strip = () => host['backgroundTasks'].read(SESSION)
  await eventually(() => expect(strip()).toMatchObject({ children: [], incomplete: true }))
  const stopStrip = () => {
    const fields = { turnId: 'background-tasks', scope: 'background-tasks' as const }
    return host.cancel(CALLER, { envelope: envelope('agentSession.cancel', fields), ...fields })
  }

  await stopStrip()
  expect(connection.closed).toBe(false)
  expect(strip()).toMatchObject({ incomplete: true })

  frame(connection, {
    uuid: 'turn-end',
    ...RESUMED_BY_MESSAGE.find(({ at }) => at === 4_765)!.frame
  })
  await host.flushStreamedEvents(SESSION)
  clock += STRUCTURED_AGENT_SESSION_IDLE_MS + 1
  await host.collaboratorsForTests().lifetime.idleSweep.tick()
  expect(connection.closed).toBe(false)
  await expect(stopStrip()).resolves.toMatchObject({ ok: true, value: { cancelled: true } })
  expect(connection.closed).toBe(true)
  await eventually(() => expect(strip()?.incomplete).toBeUndefined())
})

it('keeps a helper working while its own shell runs and through its wake-up, ending on its answer', async () => {
  const connection = claude.connections[0]!
  await sendAndEcho(connection, 'Sleep in the background.')
  const start = clock
  let next = 0
  const replay = async (until: number) => {
    for (; WAKES_AFTER_ITS_SHELL[next] && WAKES_AFTER_ITS_SHELL[next]!.at <= until; next++) {
      const captured = WAKES_AFTER_ITS_SHELL[next]!
      clock = start + captured.at
      frame(connection, { uuid: `wake-${next}`, ...captured.frame })
    }
    await host.flushStreamedEvents(SESSION)
  }
  const helper = async () => (await savedRows()).find(({ id }) => id === 'agent-1')
  const strip = () =>
    host['backgroundTasks'].read(SESSION)?.children?.map((child) => child.providerId) ?? []

  // CLI completion does not end the helper while its spawned shell still runs.
  await replay(11_913)
  await eventually(async () => expect(await helper()).toMatchObject({ state: 'working' }))
  expect(strip()).toEqual(['agent-1', 'shell-1'])

  // Restart the same helper run after its shell exits.
  await replay(44_460)
  await eventually(async () => expect(await helper()).toMatchObject({ state: 'working' }))
  expect(strip()).toEqual(['agent-1'])

  await replay(46_199)
  await eventually(async () =>
    expect(await helper()).toMatchObject({
      state: 'completed',
      tokens: 18_181,
      startedAt: start + 15,
      settledAt: start + 46_198
    })
  )
  expect(host['backgroundTasks'].read(SESSION)?.children).toMatchObject([
    { providerId: 'agent-1', state: 'done', membership: 'settled', stoppable: false }
  ])
  expect((await savedRows()).filter(({ id }) => id === 'agent-1')).toHaveLength(1)
})

it('settles a helper still running when its session closes as unverifiable, claiming no Stop', async () => {
  const connection = claude.connections[0]!
  await sendAndEcho(connection, 'Run it in the background.')
  for (const [index, captured] of RESUMED_BY_MESSAGE.filter(({ at }) => at <= 4_765).entries()) {
    frame(connection, { uuid: `launch-${index}`, ...captured.frame })
  }
  await eventually(async () =>
    expect(await savedRows()).toEqual([expect.objectContaining({ state: 'working' })])
  )
  await adapter.closeSession(SESSION)
  expect(connection.closed).toBe(true)
  await eventually(async () =>
    expect(await savedRows()).toEqual([expect.objectContaining({ state: 'unverifiable' })])
  )
  expect((await savedRows())[0]).not.toHaveProperty('outcomeBasis')
})

it('keeps a helper the next child resumes while it is still starting working, past that start’s settlement', async () => {
  const first = claude.connections[0]!
  await sendAndEcho(first, 'Run it in the background.')
  for (const [index, captured] of RESUMED_BY_MESSAGE.filter(({ at }) => at <= 4_765).entries()) {
    frame(first, { uuid: `launch-${index}`, ...captured.frame })
  }
  await eventually(async () =>
    expect(await savedRows()).toEqual([expect.objectContaining({ state: 'working' })])
  )
  await adapter.closeSession(SESSION)
  await eventually(async () =>
    expect(await savedRows()).toEqual([expect.objectContaining({ state: 'unverifiable' })])
  )
  // Inject helper activity before startup returns and before old-generation sweeping.
  const opened = claude.connections.push.bind(claude.connections)
  vi.spyOn(claude.connections, 'push').mockImplementation((connection) => {
    const initialize = connection.initializationResult
    connection.initializationResult = async () => {
      const initialized = await initialize()
      for (const [index, captured] of RESUMED_BY_MESSAGE.filter(
        ({ at }) => at >= 16_142 && at <= 16_143
      ).entries()) {
        frame(connection, { uuid: `resume-${index}`, ...captured.frame })
      }
      return initialized
    }
    return opened(connection)
  })
  const body = hostTestMessage('Carry on.')
  await host.send(CALLER, { envelope: envelope('agentSession.send', { body }), body })
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(claude.connections).toHaveLength(2)
  expect(await savedRows()).toEqual([expect.objectContaining({ id: 'agent-1', state: 'working' })])
})

it('steers with current choices while saving future choices for the next message', async () => {
  const written = (on: FakeConnection, text: string) =>
    on.sent.find((message) => JSON.stringify(message).includes(text))
  const snapshot = async () => {
    await host.flushStreamedEvents(SESSION)
    return host.journalSnapshot(SESSION)
  }
  const send = async (text: string, options?: Record<string, string>, steer?: true) => {
    const fields = { body: hostTestMessage(text), options, ...(steer ? { steer } : {}) }
    const sent = await host.send(CALLER, {
      envelope: envelope('agentSession.send', fields),
      ...fields
    })
    if (!sent.ok) {
      throw new Error(JSON.stringify(sent.refusal))
    }
    return sent.value.clientMessageId
  }
  claudeFrames.initProof = 'none'
  const first = claude.connections[0]!
  const dispatch = vi.spyOn(adapter, 'dispatch')
  const submission = async (id: string) =>
    (await snapshot()).submissions.find(({ clientMessageId }) => clientMessageId === id)
  const idle = () =>
    eventually(() =>
      expect(host.collaboratorsForTests().conversationDelivery.loop.isRunning(SESSION)).toBe(false)
    )
  const init = (on: FakeConnection, permissionMode = 'auto') =>
    frame(on, {
      type: 'system',
      subtype: 'init',
      uuid: `init-${claude.connections.length}`,
      model: on.launch.options.model === 'opus' ? 'claude-opus-4-6' : 'claude-haiku-4-5',
      permissionMode
    })
  const echo = (on: FakeConnection, text: string) =>
    frame(on, { ...written(on, text)!, isReplay: true, parent_tool_use_id: null })
  const finish = (on: FakeConnection, text: string) => {
    const input = written(on, text)!
    frame(on, {
      type: 'assistant',
      uuid: `reply-${text}`,
      parent_tool_use_id: null,
      message: {
        id: `reply-${text}`,
        role: 'assistant',
        content: [{ type: 'text', text: `${text} result` }]
      },
      user_message_uuid: input.uuid,
      user_message_uuids: [input.uuid]
    })
    frame(on, {
      type: 'result',
      subtype: 'success',
      uuid: `result-${text}`,
      is_error: false,
      terminal_reason: 'completed',
      user_message_uuid: input.uuid,
      user_message_uuids: [input.uuid]
    })
    frame(on, { type: 'system', subtype: 'session_state_changed', state: 'idle' })
  }
  const opened = async (text: string, options?: Record<string, string>) => {
    const id = await send(text, options)
    await eventually(() => expect(written(claude.connections.at(-1)!, text)).toBeDefined())
    const on = claude.connections.at(-1)!
    init(on)
    echo(on, text)
    await eventually(() => expect(host.currentWork(SESSION)?.activeTurnId()).not.toBeNull())
    await idle()
    return { id, on }
  }
  init(first)
  await opened('A')
  for (const captured of MOVED_TO_BACKGROUND.filter(({ at }) => at <= 11_139)) {
    frame(first, captured.frame)
  }
  await eventually(async () =>
    expect(await savedRows()).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: 'working' })])
    )
  )
  const choices = { model: 'opus', effort: 'high', fastMode: 'true' }
  await store.replaceSessionOptions({
    sessionId: SESSION,
    fence: store.getRecord(SESSION)!.lease.runtimeFence,
    options: { ...choices, permissionMode: 'auto' },
    now: NOW
  })
  const controls = first.calls.length
  const b = await send('B', choices, true)
  await eventually(() => expect(written(first, 'B')).toBeDefined())
  await idle()
  expect(first.calls.slice(controls)).toEqual([])
  expect(first.closeCount).toBe(0)
  expect(claude.connections).toHaveLength(1)
  const bIndex = dispatch.mock.calls.findIndex(([input]) => input.clientMessageId === b)
  expect(dispatch.mock.calls[bIndex]![0].executionOptions).toEqual({ model: 'haiku' })
  expect(await dispatch.mock.results[bIndex]!.value).toMatchObject({ state: 'admitted' })
  expect((await submission(b))?.options).toEqual({ model: 'haiku' })
  expect(store.getRecord(SESSION)?.options).toEqual({ ...choices, permissionMode: 'auto' })
  expect(await savedRows()).toEqual(
    expect.arrayContaining([expect.objectContaining({ state: 'working' })])
  )
  echo(first, 'B')
  for (const captured of MOVED_TO_BACKGROUND.filter(({ at }) => at >= 51_275 && at <= 52_441)) {
    frame(first, captured.frame)
  }
  await eventually(async () =>
    expect(await savedRows()).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: 'completed' })])
    )
  )
  finish(first, 'A')
  await eventually(() => expect(host.currentWork(SESSION)?.activeTurnId()).toBeNull())
  const c = await send('C', choices)
  await eventually(() => expect(written(first, 'C')).toBeDefined())
  await idle()
  expect(claude.connections).toHaveLength(1)
  const cIndex = dispatch.mock.calls.findIndex(([input]) => input.clientMessageId === c)
  expect(dispatch.mock.calls[cIndex]![0].executionOptions).toEqual(choices)
  expect((await submission(c))?.options).toEqual(choices)
  expect(first.calls.slice(controls)).toEqual(
    expect.arrayContaining([{ subtype: 'set_model', params: { model: 'opus' } }])
  )
  echo(first, 'C')
  finish(first, 'C')
  await eventually(() => expect(host.currentWork(SESSION)?.activeTurnId()).toBeNull())
  await eventually(async () => expect((await submission(c))?.dispatchState).toBe('accepted'))
  for (const text of ['A', 'B', 'C']) {
    expect(
      first.sent.filter((message) => JSON.stringify(message).includes(`"${text}"`))
    ).toHaveLength(1)
  }
  expect(
    (await snapshot()).items.flatMap(({ body }) =>
      body.kind === 'message'
        ? body.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : []))
        : []
    )
  ).toEqual(expect.arrayContaining(['A result', 'C result']))
})
