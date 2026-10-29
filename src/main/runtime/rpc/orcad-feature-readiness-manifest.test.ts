import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALL_RPC_METHODS } from './methods'
import { ACCOUNT_METHODS } from './methods/accounts'
import type { OrcadFeature } from './orcad-feature-readiness'

const requiresOf = (name: string): readonly OrcadFeature[] | undefined =>
  ALL_RPC_METHODS.find((method) => method.name === name)?.requires

describe('which RPC methods wait for an orcad startup phase', () => {
  it('gates the account services, search index, orchestration and orphan adoption', () => {
    for (const method of ALL_RPC_METHODS) {
      const expected: OrcadFeature[] = []
      // Claude/Codex account services only; usage credentials and Antigravity live elsewhere.
      if (
        ACCOUNT_METHODS.some((account) => account.name === method.name) &&
        method.name !== 'accounts.setHostLaunchEnv' &&
        method.name !== 'accounts.unsubscribe'
      ) {
        expected.push('accounts')
      }
      if (method.name.startsWith('orchestration.')) {
        expected.push('orchestration')
      }
      if (/^aiVault\.(searchSessions|searchStatus|setSearchEnabled)$/.test(method.name)) {
        expected.push('sessionSearch')
      }
      if (method.name === 'terminal.adoptOrphans') {
        expected.push('unshownPlacement')
      }
      expect({ name: method.name, requires: method.requires ?? [] }).toEqual({
        name: method.name,
        requires: expected
      })
    }
  })

  it('never gates what every client calls at connect', () => {
    for (const name of [
      'status.get',
      'repo.list',
      'session.tabs.subscribe',
      'terminal.list',
      'worktree.teardownMissingTerminals',
      'accounts.setHostLaunchEnv'
    ]) {
      expect(ALL_RPC_METHODS.some((method) => method.name === name)).toBe(true)
      expect(requiresOf(name)).toBeUndefined()
    }
  })

  // No behavior change yet: orcad opens every latch before RPC starts accepting calls.
  it('opens every latch before orcad starts RPC', () => {
    const read = (file: string): string =>
      readFileSync(join(__dirname, '../../orcad', file), 'utf8')
    const entry = read('orcad-entry.ts')
    const restore = read('orcad-restored-terminal-authority.ts')
    const rpcStart = entry.indexOf("await timed('rpc', () => rpc.start())")
    const restored = entry.indexOf('await restoreOrcadTerminalAuthority(')
    expect(rpcStart).toBeGreaterThan(0)
    expect(restored).toBeGreaterThan(0)
    expect(restored).toBeLessThan(rpcStart)
    for (const feature of ['accounts', 'sessionSearch']) {
      const opened = entry.indexOf(`featureReadiness.open('${feature}')`)
      expect(opened, feature).toBeGreaterThan(0)
      expect(opened, feature).toBeLessThan(rpcStart)
    }
    for (const feature of ['orchestration', 'unshownPlacement']) {
      expect(restore).toContain(`readiness.open('${feature}')`)
    }
  })
})
