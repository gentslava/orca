import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'
import { createSettings } from './runtime-home-settings-test-fixtures'
import {
  createCodexAccountRecord,
  createCodexAuthJson,
  createManagedAuth,
  createStore,
  setupRuntimeHomeTest,
  teardownRuntimeHomeTest,
  testState
} from './runtime-home-service-test-harness'

vi.mock('../codex/codex-daemon-socket-path-guard', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyCodexDaemonSocketGuard: (config: string) => config
}))
vi.mock('electron', () => ({ app: { getPath: () => testState.userDataDir } }))
vi.mock(import('node:os'), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, homedir: () => testState.fakeHomeDir }
})

const bridges = vi.hoisted(() => ({
  account: vi.fn(async (_args: { sourceCodexHomePaths: readonly string[] }) => {}),
  system: vi.fn(async () => {}),
  wsl: vi.fn(async () => {})
}))

// Every lane that links Codex sessions between homes, for one launch each.
async function launchWith(
  share: boolean | undefined,
  lane: 'real-home' | 'per-account' | 'shared-mirror',
  codexSessionSourceHome?: { host: string }
): Promise<void> {
  vi.doMock('../codex/codex-account-session-bridge', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    startCodexAccountSessionBridgeInBackground: bridges.account
  }))
  vi.doMock('../codex/codex-session-bridge', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    startSystemCodexSessionBridgeInBackground: bridges.system
  }))
  const managedHomePath = createManagedAuth(
    testState.userDataDir,
    'account-1',
    createCodexAuthJson('user@example.com', 'acct-1', 'refresh-1')
  )
  const account = createCodexAccountRecord(
    'account-1',
    'user@example.com',
    'acct-1',
    managedHomePath
  )
  const store = createStore(
    createSettings({
      realHomeRoutable: lane !== 'shared-mirror',
      codexManagedAccounts: lane === 'shared-mirror' ? [] : [account],
      ...(lane === 'per-account'
        ? {
            activeCodexManagedAccountId: 'account-1',
            activeCodexManagedAccountIdsByRuntime: { host: 'account-1', wsl: {} }
          }
        : {}),
      ...(share === undefined ? {} : { codexShareHistoryAcrossAccounts: share }),
      ...(codexSessionSourceHome ? { codexSessionSourceHome } : {})
    })
  )
  const { CodexRuntimeHomeService } = await import('./runtime-home-service')
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the harness store implements the getSettings/updateSettings surface this service reads.
  new CodexRuntimeHomeService(store as never).prepareForCodexLaunch()
}

describe('the Codex history-sharing opt-out (#24511)', () => {
  beforeEach(() => {
    setupRuntimeHomeTest()
    installFakeAppEnvironment({ getPath: () => testState.userDataDir })
    bridges.account.mockClear()
    bridges.system.mockClear()
    bridges.wsl.mockClear()
  })

  afterEach(() => {
    vi.doUnmock('../codex/codex-account-session-bridge')
    vi.doUnmock('../codex/codex-session-bridge')
    teardownRuntimeHomeTest()
  })

  it.each([
    ['real-home', 'account'],
    ['per-account', 'account'],
    ['shared-mirror', 'system']
  ] as const)('the %s lane shares history by default', async (lane, bridge) => {
    await launchWith(undefined, lane)
    expect(bridges[bridge]).toHaveBeenCalled()
  })

  it.each(['real-home', 'per-account', 'shared-mirror'] as const)(
    'the %s lane links nothing when sharing is off',
    async (lane) => {
      await launchWith(false, lane)
      expect(bridges.account).not.toHaveBeenCalled()
      expect(bridges.system).not.toHaveBeenCalled()
    }
  )

  it('the WSL lane links no sibling or system history when sharing is off', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    const wslHome = join(testState.userDataDir, 'ubuntu-home')
    vi.doMock('../codex/wsl-codex-session-bridge', () => ({
      startWslCodexSessionBridgeInBackground: bridges.wsl
    }))
    vi.doMock('../wsl', () => ({ getDefaultWslDistro: () => 'Ubuntu', getWslHome: () => wslHome }))
    const accountsRoot = join(wslHome, '.local', 'share', 'orca', 'codex-accounts')
    const wslAccount = (id: string) => ({
      id,
      email: `${id}@example.com`,
      managedHomePath: join(accountsRoot, id, 'home'),
      managedHomeRuntime: 'wsl' as const,
      wslDistro: 'Ubuntu',
      wslLinuxHomePath: join(accountsRoot, id, 'home'),
      providerAccountId: null,
      workspaceLabel: null,
      workspaceAccountId: null,
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    })
    try {
      const store = createStore(
        createSettings({
          codexManagedAccounts: [wslAccount('a'), wslAccount('b')],
          activeCodexManagedAccountIdsByRuntime: { host: null, wsl: { Ubuntu: 'b' } },
          codexShareHistoryAcrossAccounts: false
        })
      )
      const { CodexRuntimeHomeService } = await import('./runtime-home-service')
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the harness store implements the getSettings/updateSettings surface this service reads.
      const service = new CodexRuntimeHomeService(store as never)

      expect(service.prepareForCodexLaunch({ runtime: 'wsl', wslDistro: 'Ubuntu' })).toBe(
        join(accountsRoot, 'b', 'home')
      )
      await Promise.resolve()
      expect(bridges.wsl).not.toHaveBeenCalled()
    } finally {
      vi.doUnmock('../codex/wsl-codex-session-bridge')
      vi.doUnmock('../wsl')
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform)
      }
    }
  })

  // E9: a history source inside a distro would be read over 9P, booting a stopped distro.
  const WSL_SOURCE = { host: '\\\\wsl.localhost\\Ubuntu\\home\\me\\.codex' }

  it('the per-account lane leaves a WSL history source out of its sources', async () => {
    await launchWith(undefined, 'per-account', WSL_SOURCE)
    expect(bridges.account).toHaveBeenCalled()
    for (const [{ sourceCodexHomePaths }] of bridges.account.mock.calls) {
      expect(sourceCodexHomePaths).not.toContain(WSL_SOURCE.host)
    }
  })

  it('the shared-mirror lane starts no bridge from a WSL history source', async () => {
    await launchWith(undefined, 'shared-mirror', WSL_SOURCE)
    expect(bridges.system).not.toHaveBeenCalled()
  })

  it('the shared-mirror lane still bridges from an ordinary custom source', async () => {
    const host = join(testState.fakeHomeDir, 'custom-codex')
    await launchWith(undefined, 'shared-mirror', { host })
    expect(bridges.system).toHaveBeenCalledWith({}, host)
  })

  it.each([
    ['a WSL history source', WSL_SOURCE.host, false],
    ['an ordinary custom source', '/custom/codex', true]
  ])('the system-default migration scan with %s is eligible: %s', async (_name, host, eligible) => {
    // Shell startup files are read from HOME; keep the developer's own CODEX_HOME out of it.
    vi.stubEnv('HOME', testState.fakeHomeDir)
    const store = createStore(
      createSettings({ realHomeRoutable: true, codexSessionSourceHome: { host } })
    )
    const { CodexRuntimeHomeService } = await import('./runtime-home-service')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the harness store implements the getSettings/updateSettings surface this service reads.
    const service = new CodexRuntimeHomeService(store as never)
    expect(service.isHostSystemDefaultSessionMigrationEligible()).toBe(eligible)
    vi.unstubAllEnvs()
  })

  it.each([
    ['a WSL history source', WSL_SOURCE.host, false],
    ['an ordinary custom source', '/custom/codex', true]
  ])(
    'preparing a migration pass with %s marks the backfill pending: %s',
    async (_name, host, marks) => {
      vi.stubEnv('HOME', testState.fakeHomeDir)
      const store = createStore(
        createSettings({ realHomeRoutable: true, codexSessionSourceHome: { host } })
      )
      const { CodexRuntimeHomeService } = await import('./runtime-home-service')
      const { resolveCodexSessionBackfillPaths } = await import('../codex/codex-session-backfill')
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the harness store implements the getSettings/updateSettings surface this service reads.
      const service = new CodexRuntimeHomeService(store as never)

      service.prepareHostSystemDefaultSessionMigrationPass()

      expect(existsSync(resolveCodexSessionBackfillPaths(host).markerPath)).toBe(marks)
      vi.unstubAllEnvs()
    }
  )
})
