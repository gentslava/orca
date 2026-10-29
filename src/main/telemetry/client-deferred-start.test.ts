import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import type * as PostHogTransport from './posthog-transport'
import {
  BASE_COMMON,
  makeFakeSettings,
  makeFakeStore,
  makeMockPostHog,
  type MockPostHog,
  restoreConsentEnv,
  stashAndClearConsentEnv
} from './client-test-harness'

const { createPostHogClient } = vi.hoisted(() => {
  // Official-build identity is read at import; set it before client.ts loads.
  Object.assign(globalThis, { ORCA_BUILD_IDENTITY: 'stable', ORCA_POSTHOG_WRITE_KEY: 'test-key' })
  return { createPostHogClient: vi.fn() }
})
vi.mock('./posthog-transport', async (importOriginal) => ({
  ...(await importOriginal<typeof PostHogTransport>()),
  createPostHogClient
}))

const { initTelemetry, setOptIn, shutdownTelemetry, track } = await import('./client')
const scheduleClientStart = vi.fn<(start: () => void) => void>()

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'ORCA_BUILD_IDENTITY')
  Reflect.deleteProperty(globalThis, 'ORCA_POSTHOG_WRITE_KEY')
})

describe('deferred PostHog client start', () => {
  let envStash: Record<string, string | undefined>
  let store: Store
  let sdk: MockPostHog

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-29T00:00:00Z') })
    envStash = stashAndClearConsentEnv()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    sdk = makeMockPostHog()
    createPostHogClient.mockImplementation(() => sdk)
    store = makeFakeStore(
      makeFakeSettings({
        optedIn: true,
        installId: BASE_COMMON.install_id,
        existedBeforeTelemetryRelease: false
      })
    )
    initTelemetry(store, scheduleClientStart)
  })

  afterEach(async () => {
    await shutdownTelemetry()
    vi.useRealTimers()
    vi.restoreAllMocks()
    createPostHogClient.mockReset()
    scheduleClientStart.mockReset()
    restoreConsentEnv(envStash)
  })

  it('holds startup events, then replays them in order with their original timestamps', () => {
    expect(track('app_opened', {})).toBe(true)
    vi.advanceTimersByTime(1_000)
    expect(track('telemetry_opted_in', { via: 'settings' })).toBe(true)
    expect(createPostHogClient).not.toHaveBeenCalled()

    const [[startClient]] = scheduleClientStart.mock.calls
    startClient()

    expect(createPostHogClient).toHaveBeenCalledTimes(1)
    const captured = sdk.capture.mock.calls.map(([message]) => message)
    expect(captured.map((message) => [message.event, message.timestamp])).toEqual([
      ['app_opened', new Date('2026-10-29T00:00:00Z')],
      ['telemetry_opted_in', new Date('2026-10-29T00:00:01Z')]
    ])
  })

  it('starts the client early to flush held events and enqueue the opt-out before opting out', async () => {
    track('app_opened', {})
    const order: string[] = []
    sdk.capture.mockImplementation((message: { event?: string; uuid?: string }) => {
      order.push(`capture:${message.event}`)
      queueMicrotask(() => sdk.emitForTests('capture', message))
    })
    sdk.optOut.mockImplementation(async () => {
      order.push('optOut')
    })

    await setOptIn('settings', false)

    expect(order).toEqual(['capture:app_opened', 'capture:telemetry_opted_out', 'optOut'])
  })

  it('still saves an opt-out when the client cannot start', async () => {
    createPostHogClient.mockImplementation(() => {
      throw new Error('sdk failed to load')
    })

    await setOptIn('settings', false)

    expect(store.getSettings().telemetry?.optedIn).toBe(false)
  })

  it('starts the client at quit to flush events held before its start', async () => {
    track('app_opened', {})

    await shutdownTelemetry()

    expect(sdk.capture).toHaveBeenCalledWith(expect.objectContaining({ event: 'app_opened' }))
    expect(sdk.shutdown).toHaveBeenCalledTimes(1)
  })
})
