import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createBridgeDiagnosticReporter } from './diagnostics/bridge-diagnostic-log'

let warned: MockInstance<typeof console.warn>

beforeEach(() => {
  warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  warned.mockClear()
})

describe('the bridge diagnostic log', () => {
  it('bounds repeated picker refusals while retaining distinct sources, stages and reasons', () => {
    const reported = vi.fn()
    const report = createBridgeDiagnosticReporter(reported)
    const refusal = {
      kind: 'native-media-pick-refused',
      source: 'library',
      stage: 'handler',
      reason: 'native_verb_failed'
    } as const
    report(refusal)
    report(refusal)
    report({ ...refusal, source: 'files' })
    report({ ...refusal, stage: 'pre-dispatch' })
    report({ ...refusal, reason: 'native_media_handle_cap' })
    expect(reported).toHaveBeenCalledTimes(4)
    expect(warned.mock.calls).toEqual([
      [
        '[web-shell-bridge] a native media pick was refused',
        {
          source: 'library',
          stage: 'handler',
          reason: 'native_verb_failed'
        }
      ],
      [
        '[web-shell-bridge] a native media pick was refused',
        {
          source: 'files',
          stage: 'handler',
          reason: 'native_verb_failed'
        }
      ],
      [
        '[web-shell-bridge] a native media pick was refused',
        {
          source: 'library',
          stage: 'pre-dispatch',
          reason: 'native_verb_failed'
        }
      ],
      [
        '[web-shell-bridge] a native media pick was refused',
        {
          source: 'library',
          stage: 'handler',
          reason: 'native_media_handle_cap'
        }
      ]
    ])
  })
})

afterEach(() => warned.mockRestore())
