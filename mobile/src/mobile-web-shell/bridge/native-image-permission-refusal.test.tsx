import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'

// Avoid Expo imports through re-exported screen hooks; this test calls none of them.
vi.mock('../../transport/connection/host-client-hooks', () => ({
  useDisconnectHostClient: () => () => {},
  useForceReconnect: () => null,
  useForgetHostClient: () => () => {},
  useHostClient: () => ({ client: null, clientId: null, state: 'disconnected' }),
  usePrimeHosts: () => () => {},
  useRefreshHostClient: () => () => {}
}))

import { RpcClientProvider } from '../../transport/connection/client-context.web'
import { createFakeBridgePortPair, disposeBridgePortPair } from './bridge-port-pair-test-harness'
import { NativeVerbError, useNativeVerbs, type NativeVerbs } from './use-native-verbs'

const held: { verbs: NativeVerbs | null } = { verbs: null }

function Screen(): null {
  held.verbs = useNativeVerbs()
  return null
}

it('preserves a checked image permission refusal without exposing handler details', async () => {
  const pair = createFakeBridgePortPair({
    serveNativeVerb: () =>
      Promise.reject(
        Object.assign(new Error('device-private detail'), {
          code: 'native_image_permission_denied'
        })
      )
  })
  let tree: ReactTestRenderer | null = null
  try {
    await pair.flush()
    await act(async () => {
      tree = create(
        <RpcClientProvider client={pair.client}>
          <Screen />
        </RpcClientProvider>
      )
    })
    const verbs = held.verbs
    if (verbs === null) {
      throw new Error('Native verbs did not mount')
    }
    const pending = verbs.readClipboardText().catch((error: unknown) => error)
    await pair.flush()
    const error = await pending
    if (!(error instanceof NativeVerbError)) {
      throw new Error('Native refusal lost its checked type')
    }
    expect(error.reason).toBe('native_image_permission_denied')
    expect(error.message).not.toContain('device-private detail')
  } finally {
    await act(async () => tree?.unmount())
    await disposeBridgePortPair(pair)
  }
})
