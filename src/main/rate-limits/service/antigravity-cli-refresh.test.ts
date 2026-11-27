import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RateLimitService } from './rate-limit-service'
import type { ProviderRateLimits } from '../../../shared/agent-usage/rate-limits/rate-limit-types'

const { readUsageLogin, fetchAntigravityRateLimits } = vi.hoisted(() => ({
  readUsageLogin: vi.fn<() => Promise<string | null>>(),
  fetchAntigravityRateLimits: vi.fn<() => Promise<ProviderRateLimits>>()
}))

vi.mock('../../antigravity/native-account-host', () => ({
  getAntigravityAccountService: async () => ({ readUsageLogin })
}))
vi.mock('../providers/antigravity/antigravity-usage-fetcher', () => ({
  fetchAntigravityRateLimits
}))

const target = { runtime: 'host', wslDistro: null } as const
let service: RateLimitService

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-27T05:00:00Z'))
  readUsageLogin.mockReset().mockResolvedValue('first')
  fetchAntigravityRateLimits.mockReset().mockImplementation(async () => ({
    provider: 'antigravity',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    status: 'ok',
    error: null,
    buckets: [
      {
        name: 'Gemini Models · Five Hour Limit',
        usedPercent: 93,
        windowMinutes: 300,
        resetDescription: null,
        resetsAt: Date.now() + 60 * 60_000
      }
    ]
  }))
  service = new RateLimitService()
})

afterEach(() => {
  service.stop()
  vi.useRealTimers()
})

it('starts fetching when enabled and refreshes a backgrounded profile after fifteen minutes', async () => {
  let enabled = false
  service.setAntigravityCliQuotaTarget(() => (enabled ? target : null))
  service.start({ fetchImmediately: false })
  await vi.advanceTimersByTimeAsync(15 * 60_000)
  expect(fetchAntigravityRateLimits).not.toHaveBeenCalled()

  enabled = true
  service.antigravityCliQuotaSettingChanged()
  await vi.advanceTimersByTimeAsync(0)
  expect((await service.getState()).antigravityCli?.session?.usedPercent).toBe(93)

  await vi.advanceTimersByTimeAsync(15 * 60_000)
  expect((await service.getState()).antigravityCli?.updatedAt).toBe(
    new Date('2026-11-27T05:30:00Z').getTime()
  )
})

it('rejects a reading if the CLI changes accounts midway', async () => {
  readUsageLogin.mockResolvedValueOnce('first').mockResolvedValueOnce('second')
  await expect(service.refreshAntigravityCliQuota(target)).rejects.toThrow(
    'The Antigravity account changed during refresh.'
  )
  expect((await service.getState()).antigravityCli).toBeNull()
})

it('hides receipts for another login or after the freshness window', async () => {
  await service.refreshAntigravityCliQuota(target)
  expect((await service.getState()).antigravityCli?.session?.usedPercent).toBe(93)
  readUsageLogin.mockResolvedValue('second')
  expect((await service.getState()).antigravityCli).toBeNull()
  readUsageLogin.mockResolvedValue('first')
  await vi.advanceTimersByTimeAsync(30 * 60_000)
  expect((await service.getState()).antigravityCli).toBeNull()
})
