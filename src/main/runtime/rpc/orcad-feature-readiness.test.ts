import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _resetOrcadFeatureReadinessForTests,
  installOrcadFeatureReadiness,
  ORCAD_FEATURES,
  rpcMethodFeatureWait
} from './orcad-feature-readiness'

afterEach(() => {
  _resetOrcadFeatureReadinessForTests()
  vi.useRealTimers()
})

describe('OrcadFeatureReadiness', () => {
  it('adds no await for open or undeclared features, so ungated dispatch starts synchronously', () => {
    expect(rpcMethodFeatureWait(undefined)).toBeNull()
    expect(rpcMethodFeatureWait(['accounts'])).toBeNull()
    const readiness = installOrcadFeatureReadiness()
    expect(rpcMethodFeatureWait([])).toBeNull()
    readiness.open('accounts')
    expect(rpcMethodFeatureWait(['accounts'])).toBeNull()
  })

  it('starts with every feature closed under orcad and waits for all a method names', async () => {
    const readiness = installOrcadFeatureReadiness()
    expect(ORCAD_FEATURES.every((feature) => !readiness.isOpen(feature))).toBe(true)
    let settled = false
    const wait = rpcMethodFeatureWait(['accounts', 'orchestration'])?.then(() => {
      settled = true
    })
    readiness.open('accounts')
    await Promise.resolve()
    expect(settled).toBe(false)
    readiness.open('orchestration')
    await wait
    expect(settled).toBe(true)
  })

  it('refuses with runtime_unavailable after the bound and leaves no timer behind', async () => {
    vi.useFakeTimers()
    installOrcadFeatureReadiness()
    const wait = rpcMethodFeatureWait(['sessionSearch'], 50)
    const refused = expect(wait).rejects.toThrow('runtime_unavailable')
    await vi.advanceTimersByTimeAsync(50)
    await refused
    expect(vi.getTimerCount()).toBe(0)
  })
})
