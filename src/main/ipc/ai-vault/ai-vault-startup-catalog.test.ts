import { EventEmitter } from 'node:events'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import type { AiVaultListResult } from '../../../shared/ai-vault/contracts/ai-vault-types'
import { installChats } from '../../ai-vault/structured-sessions/structured-session-ownership.test-support'
import {
  agentSessionLeaseFixture,
  agentSessionRecordFixture
} from '../../../shared/agent-session/lifecycle/agent-session-record.test-fixture'
import { setStructuredAgentSessionHost } from '../../native-chat/agent-session-wire/host/structured-agent-session-registry'
const mocks = vi.hoisted(() => {
  vi.resetModules()
  return { scanAiVaultSessionsInService: vi.fn(), ipcHandle: vi.fn() }
})
vi.mock('electron', () => ({
  app: { on: vi.fn() },
  ipcMain: { handle: mocks.ipcHandle, on: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] }
}))
vi.mock('../../ai-vault/scan-service/session-scanner-service-spawn', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  scanAiVaultSessionsInService: mocks.scanAiVaultSessionsInService
}))
vi.mock('../../wsl/discovery/distro-catalog', () => ({
  listRunningWslHomeDirsAsync: vi.fn().mockResolvedValue([]),
  hasCachedWslDistros: vi.fn(() => false)
}))
const { _internals, registerAiVaultHandlers } = await import('./ai-vault')
const EMPTY_RESULT: AiVaultListResult = {
  sessions: [],
  issues: [],
  scannedAt: '2026-07-27T00:00:00.000Z'
}
beforeEach(() => {
  vi.clearAllMocks()
  _internals.resetAiVaultCacheForTests()
})
afterEach(() => {
  _internals.resetAiVaultCacheForTests()
  setStructuredAgentSessionHost(null)
})
function ipcHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = mocks.ipcHandle.mock.calls.find(([registered]) => registered === channel)
  if (!registration) {
    throw new Error(`${channel} was not registered`)
  }
  return registration[1]
}

it('serves saved chats while provider history is still waiting, then enriches the full list', async () => {
  const record = agentSessionRecordFixture(
    agentSessionLeaseFixture({
      claimStatus: 'released',
      ownerProcess: null,
      provenHandleLinkId: null
    })
  )
  installChats([{ ...record, providerHandleChain: [], conversationName: 'Saved catalog chat' }])
  const began = Promise.withResolvers<void>()
  const scan = Promise.withResolvers<AiVaultListResult>()
  mocks.scanAiVaultSessionsInService.mockImplementationOnce(() => {
    began.resolve()
    return scan.promise
  })
  registerAiVaultHandlers()
  const sender = Object.assign(new EventEmitter(), { id: 93 })
  const list = (structuredOnly: boolean, requestToken: string) =>
    ipcHandler('aiVault:listSessions')(
      { sender },
      {
        executionHostScope: 'local',
        includeStructuredSessions: true,
        ...(structuredOnly ? { structuredOnly: true } : {}),
        requestToken
      }
    )
  const history = list(false, 'history')
  try {
    await began.promise
    await expect(list(true, 'catalog')).resolves.toMatchObject({
      includesStructuredSessions: true,
      sessions: [{ source: 'structured-record', title: 'Saved catalog chat' }]
    })
    scan.resolve(EMPTY_RESULT)
    await expect(history).resolves.toMatchObject({
      sessions: [{ title: 'Saved catalog chat' }]
    })
    await expect(list(false, 'complete')).resolves.toMatchObject({
      sessions: [{ title: 'Saved catalog chat' }]
    })
  } finally {
    scan.resolve(EMPTY_RESULT)
    try {
      await history
    } finally {
      setStructuredAgentSessionHost(null)
    }
  }
})
