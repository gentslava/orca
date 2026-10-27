import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchAntigravityRateLimits,
  resetAntigravityUsageSupportForTests
} from '../../src/main/rate-limits/antigravity-usage-fetcher'
import {
  getProviderUsageErrorMessage,
  getProviderUsageStatusLabel
} from '../../src/renderer/src/components/status-bar/usage-error-copy'

// Sanitized agy 1.4.7 `/usage` response; no conversation or model tokens were used.
const ANTIGRAVITY_LOCATION_REJECTION = {
  code: 1,
  stdout:
    '{"conversation_id":"","status":"ERROR","response":"","error":"Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.","duration_seconds":0,"num_turns":0,"usage":{"input_tokens":0,"output_tokens":0,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":0}}\n',
  stderr:
    'error: Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.\n'
} as const

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

// This crosses the host/renderer boundary; renderer unit tests consume only the shared contract.
describe('Antigravity CLI rejection to usage diagnostic', () => {
  beforeEach(() => resetAntigravityUsageSupportForTests())

  it('labels the captured rejection and preserves the specific CLI reason through the fetcher', async () => {
    const result = await fetchAntigravityRateLimits({
      resolveCommand: async () => '/test/agy',
      resolveEnvironment: async () => ({}),
      runCommand: async (spec) => ({
        signal: null,
        timedOut: false,
        ...(spec.args?.[0] === '--version'
          ? { code: 0, stdout: '1.4.7', stderr: '' }
          : ANTIGRAVITY_LOCATION_REJECTION)
      })
    })

    expect(getProviderUsageStatusLabel(result)).toBe('Refresh failed')
    expect(getProviderUsageErrorMessage(result)).toContain(
      ANTIGRAVITY_LOCATION_REJECTION.stderr.trim().replace(/^error: /, '')
    )
  })
})
