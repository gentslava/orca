import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertWslHostReachable,
  configureWslHostsGate,
  isGatedOffWslHost,
  resetWslHostsGateForTests,
  wslHostsGateOpen,
  wslHostsAppliedPolicyState,
  wslHostsGateState,
  wslHostsPolicyBlocked,
  wslHostsServing,
  wslHostsWindowArguments,
  WSL_HOSTS_GATED_OFF_MESSAGE
} from './wsl-host-gate'
import {
  ignoreInheritedWslHostsGateState,
  isWslHostsServing,
  WSL_HOSTS_GATE_STATE_ENV
} from '../../shared/wsl-host-internal-gate'

const wslHost = {
  orcadDeployment: { kind: 'wsl' as const, distro: 'Ubuntu', localPort: 41000, remotePort: 6768 }
}
const sshHost = { orcadDeployment: null }
const facts = (hasSavedWslHost: boolean, hasWslMoveCutover: boolean) => ({
  hasSavedWslHost: () => hasSavedWslHost,
  hasWslMoveCutover: () => hasWslMoveCutover
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetWslHostsGateForTests()
})

describe('WSL hosts gate', () => {
  it('flag-off with nothing saved: closed, exactly as before', () => {
    vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', undefined)
    configureWslHostsGate(facts(false, false))

    expect(wslHostsGateState()).toBe('closed')
    expect(wslHostsServing()).toBe(false)
    expect(isGatedOffWslHost(wslHost)).toBe(true)
    expect(() => assertWslHostReachable(wslHost)).toThrow(WSL_HOSTS_GATED_OFF_MESSAGE)
    expect(isGatedOffWslHost(sshHost)).toBe(false)
  })

  it.each([
    ['a saved host', facts(true, false)],
    ['a move journal entry', facts(false, true)]
  ])('serves %s behind a closed gate without opening it', (_label, saved) => {
    vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', undefined)
    configureWslHostsGate(saved)

    expect(wslHostsGateState()).toBe('serve-only')
    expect(wslHostsServing()).toBe(true)
    expect(wslHostsGateOpen()).toBe(false)
    expect(isGatedOffWslHost(wslHost)).toBe(false)
    expect(() => assertWslHostReachable(wslHost)).not.toThrow()
  })

  it('treats unreadable saved state as absent', () => {
    vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', undefined)
    configureWslHostsGate({
      hasSavedWslHost: () => {
        throw new Error('unreadable')
      },
      hasWslMoveCutover: () => {
        throw new Error('unreadable')
      }
    })

    expect(wslHostsGateState()).toBe('closed')
  })

  it('stays open with the internal gate on, and reads nothing to decide', () => {
    vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', '1')
    const hasSavedWslHost = vi.fn(() => false)
    const hasWslMoveCutover = vi.fn(() => false)
    configureWslHostsGate({ hasSavedWslHost, hasWslMoveCutover })

    expect(wslHostsGateState()).toBe('open')
    expect(hasSavedWslHost).not.toHaveBeenCalled()
    expect(hasWslMoveCutover).not.toHaveBeenCalled()
  })

  it('is closed before startup configures it', () => {
    vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', undefined)
    expect(wslHostsGateState()).toBe('closed')
  })

  it('stamps window argv only in serve-only', () => {
    vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', undefined)
    configureWslHostsGate(facts(false, false))
    expect(wslHostsWindowArguments()).toEqual([])

    configureWslHostsGate(facts(true, false))
    expect(wslHostsWindowArguments()).toEqual(['--orca-wsl-hosts-serve-only'])

    vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', '1')
    expect(wslHostsWindowArguments()).toEqual([])
  })

  describe('remote policy block', () => {
    const blocked = (hasSavedWslHost: boolean, hasWslMoveCutover: boolean) => ({
      ...facts(hasSavedWslHost, hasWslMoveCutover),
      policy: () => 'block' as const
    })

    it('closes an open internal gate for the run, in main and in shared readers', () => {
      vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', '1')
      configureWslHostsGate(blocked(false, false))

      expect(wslHostsGateOpen()).toBe(false)
      expect(wslHostsGateState()).toBe('closed')
      expect(wslHostsPolicyBlocked()).toBe(true)
      expect(isGatedOffWslHost(wslHost)).toBe(true)
      expect(isWslHostsServing(process.env)).toBe(false)
      expect(wslHostsWindowArguments()).toEqual(['--orca-wsl-hosts-policy-blocked'])
    })

    it('keeps serving saved WSL work, exactly as a closed internal gate does', () => {
      vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', '1')
      configureWslHostsGate(blocked(true, false))

      expect(wslHostsGateState()).toBe('serve-only')
      expect(wslHostsGateOpen()).toBe(false)
      expect(wslHostsServing()).toBe(true)
      expect(isWslHostsServing(process.env)).toBe(true)
      expect(wslHostsWindowArguments()).toEqual([
        '--orca-wsl-hosts-policy-blocked',
        '--orca-wsl-hosts-serve-only'
      ])
    })

    it('is not read, and changes nothing, behind a closed internal gate', () => {
      vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', undefined)
      const policy = vi.fn(() => 'block' as const)
      configureWslHostsGate({ ...facts(true, false), policy })

      expect(policy).not.toHaveBeenCalled()
      expect(wslHostsPolicyBlocked()).toBe(false)
      expect(wslHostsAppliedPolicyState()).toBeNull()
      expect(wslHostsWindowArguments()).toEqual(['--orca-wsl-hosts-serve-only'])
    })

    it('fails open to the internal gate when the policy cannot be read', () => {
      vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', '1')
      configureWslHostsGate({
        ...facts(false, false),
        policy: () => {
          throw new Error('unreadable')
        }
      })

      expect(wslHostsGateState()).toBe('open')
      expect(wslHostsAppliedPolicyState()).toBe('missing')
      expect(wslHostsWindowArguments()).toEqual([])
    })

    it('leaves SSH hosts untouched', () => {
      vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', '1')
      configureWslHostsGate(blocked(false, false))

      expect(isGatedOffWslHost(sshHost)).toBe(false)
      expect(() => assertWslHostReachable(sshHost)).not.toThrow()
    })
  })

  describe('publishing the resolved state to child processes', () => {
    it.each([
      ['open', '1', facts(false, false), undefined],
      ['serve-only', undefined, facts(true, false), undefined],
      ['closed', undefined, facts(false, false), undefined],
      ['closed', '1', facts(false, false), 'block' as const],
      ['serve-only', '1', facts(false, true), 'block' as const]
    ])('publishes %s', (state, gateEnv, saved, policy) => {
      vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', gateEnv)
      configureWslHostsGate({ ...saved, ...(policy ? { policy: () => policy } : {}) })

      expect(process.env[WSL_HOSTS_GATE_STATE_ENV]).toBe(state)
    })

    // A relaunch or the updater's installer inherits the parent's value; main must recompute.
    it.each([
      ['closed', '1', 'open', true],
      ['open', undefined, 'closed', false]
    ])(
      'ignores a stale inherited %s and overwrites it',
      (inherited, gateEnv, recomputed, serving) => {
        vi.stubEnv(WSL_HOSTS_GATE_STATE_ENV, inherited)
        vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', gateEnv)
        ignoreInheritedWslHostsGateState()
        expect(isWslHostsServing(process.env)).toBe(gateEnv === '1')

        configureWslHostsGate(facts(false, false))

        expect(wslHostsGateState()).toBe(recomputed)
        expect(process.env[WSL_HOSTS_GATE_STATE_ENV]).toBe(recomputed)
        expect(wslHostsServing()).toBe(serving)
        expect(isWslHostsServing(process.env)).toBe(serving)
      }
    )

    it('withdraws it on reset', () => {
      vi.stubEnv('ORCA_INTERNAL_WSL_HOSTS', '1')
      configureWslHostsGate(facts(false, false))
      resetWslHostsGateForTests()

      expect(process.env[WSL_HOSTS_GATE_STATE_ENV]).toBeUndefined()
    })
  })
})
