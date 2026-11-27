import { expect, it, vi } from 'vitest'
import { createNativeVerbServer } from './bridge-host-native-verbs'

it('records a checked picker refusal when the route did not grant media access', async () => {
  const serveVerb = vi.fn()
  const onDiagnostic = vi.fn()
  const handle = createNativeVerbServer({
    granted: ['navigate', 'storage'],
    serveVerb,
    onDiagnostic
  })

  await expect(
    handle('picker', 'native.media.pick', { source: 'library', multiple: false })
  ).rejects.toMatchObject({ code: 'native_verb_ungranted' })
  expect(serveVerb).not.toHaveBeenCalled()
  expect(onDiagnostic).toHaveBeenCalledExactlyOnceWith({
    kind: 'native-media-pick-refused',
    source: 'library',
    stage: 'pre-dispatch',
    reason: 'native_verb_ungranted'
  })
})
