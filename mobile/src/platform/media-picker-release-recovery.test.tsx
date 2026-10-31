import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../transport/host-client-hooks', () => ({
  useDisconnectHostClient: () => () => {},
  useForceReconnect: () => null,
  useForgetHostClient: () => () => {},
  useHostClient: () => ({ client: null, clientId: null, state: 'disconnected' }),
  usePrimeHosts: () => () => {},
  useRefreshHostClient: () => () => {}
}))

import { RpcClientProvider } from '../transport/client-context.web'
import { createFakeBridgePortPair } from '../mobile-web-shell/bridge/bridge-port-pair-test-harness'
import {
  BRIDGE_MEDIA_MAX_LIVE_HANDLES,
  mediaPickResultSchema
} from '../mobile-web-shell/bridge/bridge-media-verbs'
import { MediaHandleRegistry } from '../mobile-web-shell/media-handle-registry'
import { createNativeMediaVerbServer } from './native-media'
import { useMediaPicker } from './media-picker.web'
import type { MediaPicker } from './media-picker-contract'

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const PNG_BYTES = Uint8Array.from(atob(PNG), (character) => character.charCodeAt(0))
const dispose: (() => void)[] = []
afterEach(() => {
  for (const close of dispose.splice(0)) {
    close()
  }
  vi.restoreAllMocks()
})

async function setup() {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const state = { failRelease: true, picks: 0, releases: 0 }
  const registry = new MediaHandleRegistry({ now: () => 1000, discard: () => {} })
  const serve = createNativeMediaVerbServer({
    registry,
    launchLibrary: async () => {
      state.picks += 1
      return {
        canceled: false,
        assets: [{ uri: 'file:///cache/photo.png', mimeType: 'image/png' }]
      }
    },
    launchFiles: async () => ({ canceled: true }),
    readClipboardImage: async () => null,
    stageBase64: () => 'file:///cache/photo.png',
    openFile: () => ({
      size: PNG_BYTES.length,
      open: () => {
        let offset = 0
        return {
          get offset() {
            return offset
          },
          set offset(value: number | null) {
            offset = value ?? 0
          },
          readBytes: (length: number) => {
            const bytes = PNG_BYTES.slice(offset, offset + length)
            offset += bytes.length
            return bytes
          },
          close: () => {}
        }
      }
    }),
    ownsStagedUri: () => true,
    copyIntoCache: (uri) => uri,
    discard: () => {}
  })
  const pair = createFakeBridgePortPair({
    serveNativeVerb: async (verb, params) => {
      if (verb === 'native.media.release') {
        state.releases += 1
        if (state.failRelease) {
          throw new Error('injected cleanup transport failure')
        }
      }
      return serve(verb, params)
    }
  })
  await pair.flush()
  const held: { picker: MediaPicker | null } = { picker: null }
  function Screen(): null {
    held.picker = useMediaPicker()
    return null
  }
  let tree: ReactTestRenderer
  function mount(): void {
    act(() => {
      tree = create(
        <RpcClientProvider client={pair.client}>
          <Screen />
        </RpcClientProvider>
      )
    })
  }
  mount()
  dispose.push(() => {
    act(() => tree.unmount())
    pair.client.close()
    pair.host.dispose()
    registry.releaseAll()
  })
  return {
    state,
    registry,
    client: pair.client,
    pick: async () => {
      if (held.picker === null) {
        throw new Error('missing picker')
      }
      return held.picker.pickImage('library')
    },
    remount: () => {
      act(() => tree.unmount())
      mount()
    }
  }
}

describe('recovery after staged-media cleanup fails', () => {
  it.each([false, true])(
    'reclaims eight stranded handles before picking again (remount: %s)',
    async (remount) => {
      const probe = await setup()
      for (let index = 0; index < BRIDGE_MEDIA_MAX_LIVE_HANDLES; index += 1) {
        await expect(probe.pick()).resolves.toMatchObject({ base64: PNG })
      }
      expect(probe.registry.liveCount()).toBe(BRIDGE_MEDIA_MAX_LIVE_HANDLES)
      if (remount) {
        probe.remount()
      }
      probe.state.failRelease = false
      await expect(probe.pick()).resolves.toMatchObject({ base64: PNG })
      expect(probe.state.picks).toBe(BRIDGE_MEDIA_MAX_LIVE_HANDLES + 1)
      expect(probe.registry.liveCount()).toBe(0)
    }
  )

  it('preserves a persistent refusal and recovers on a later attempt without replaying the picker', async () => {
    const probe = await setup()
    for (let index = 0; index < BRIDGE_MEDIA_MAX_LIVE_HANDLES; index += 1) {
      await probe.pick()
    }
    await expect(probe.pick()).rejects.toMatchObject({ reason: 'native_media_handle_cap' })
    expect(probe.state.picks).toBe(BRIDGE_MEDIA_MAX_LIVE_HANDLES)
    probe.state.failRelease = false
    await expect(probe.pick()).resolves.toMatchObject({ base64: PNG })
    expect(probe.state.picks).toBe(BRIDGE_MEDIA_MAX_LIVE_HANDLES + 1)
    expect(probe.registry.liveCount()).toBe(0)
  })
})

it('keeps a staged handle still owned by another reader alive', async () => {
  const probe = await setup()
  const reply = await probe.client.callNativeVerb('native.media.pick', {
    source: 'library',
    multiple: false
  })
  const items = mediaPickResultSchema.parse(reply.result).items
  const handle = items[0]?.handle
  if (handle === undefined) {
    throw new Error('no staged image')
  }
  await expect(probe.pick()).resolves.toMatchObject({ base64: PNG })
  probe.state.failRelease = false
  await expect(probe.pick()).resolves.toMatchObject({ base64: PNG })
  expect(probe.registry.liveCount()).toBe(1)
  expect(probe.registry.read(handle, 0, 1).uri).toBe('file:///cache/photo.png')
})
