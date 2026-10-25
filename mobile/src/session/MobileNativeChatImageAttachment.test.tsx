import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatImageRefBlock } from '../../../src/shared/native-chat-types'
import { stubRpcClient } from '../transport/rpc-client-test-stub'
import type { RpcClient } from '../transport/rpc-client'
import { findAllByHostType, findByHostType } from '../test-support/react-test-renderer-host-nodes'
import { Prose } from './MobileNativeChatProse'
import { MobileNativeChatRowOverlaysContext } from './mobile-native-chat-row-overlays'

vi.mock('react-native', () => ({
  Image: 'Image',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Platform: { OS: 'ios', select: (options: { ios?: unknown }) => options.ios }
}))
vi.mock('../components/MobileMarkdown', () => ({ MobileMarkdown: 'MobileMarkdown' }))

const PATH = '/Users/host/Library/Application Support/orca/agent-session-attachments/one/photo.png'
const URI = 'data:image/png;base64,AA=='
const REPLY = {
  id: 'image',
  ok: true as const,
  result: { content: 'AA==', isBinary: true, isImage: true, mimeType: 'image/png' }
}

describe('host-owned mobile chat images', () => {
  let tree: ReactTestRenderer | undefined
  const openImage = vi.fn()
  const render = (
    client: RpcClient | null,
    block: NativeChatImageRefBlock = { type: 'image-ref', path: PATH }
  ) => {
    const value = {
      openImage,
      openActions: () => {},
      imageSource: client ? { client, sessionId: 'chat' } : null
    }
    return createElement(
      MobileNativeChatRowOverlaysContext.Provider,
      { value },
      createElement(Prose, { block, text: '', fontScale: 1 })
    )
  }
  afterEach(() => {
    act(() => tree?.unmount())
    tree = undefined
    openImage.mockClear()
  })

  it('loads a stored host image and opens the fetched bytes full size', async () => {
    const sendRequest = vi.fn<RpcClient['sendRequest']>().mockResolvedValue(REPLY)
    await act(async () => {
      tree = create(render(stubRpcClient({ sendRequest })))
    })
    if (!tree) {
      throw new Error('image did not mount')
    }
    expect(findAllByHostType(tree.root, 'Image').map((node) => node.props.source)).toEqual([
      { uri: URI }
    ])
    expect(sendRequest).toHaveBeenCalledWith(
      'agentSessionAttachment.read',
      { path: PATH },
      expect.anything()
    )
    const button = tree.root.findAllByProps({ accessibilityLabel: 'Attached image' })[0]
    act(() => button?.props.onPress())
    expect(openImage).toHaveBeenCalledWith({ uri: URI, label: 'Attached image' })
  })

  it('keeps the device preview without reading its host path', async () => {
    const sendRequest = vi.fn<RpcClient['sendRequest']>()
    await act(async () => {
      tree = create(
        render(stubRpcClient({ sendRequest }), {
          type: 'image-ref',
          path: PATH,
          url: 'file:///phone/photo.png'
        })
      )
    })
    if (!tree) {
      throw new Error('image did not mount')
    }
    expect(findByHostType(tree.root, 'Image').props.source).toEqual({
      uri: 'file:///phone/photo.png'
    })
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('does not read arbitrary host files or fall back when the owning client is absent', async () => {
    const sendRequest = vi.fn<RpcClient['sendRequest']>()
    await act(async () => {
      tree = create(
        render(stubRpcClient({ sendRequest }), { type: 'image-ref', path: '/private/secret.png' })
      )
    })
    expect(sendRequest).not.toHaveBeenCalled()
    await act(async () => tree?.update(render(null)))
    expect(sendRequest).not.toHaveBeenCalled()
    expect(tree && findAllByHostType(tree.root, 'Image')).toEqual([])
  })

  it('lets a failed read retry without showing a broken image', async () => {
    const sendRequest = vi
      .fn<RpcClient['sendRequest']>()
      .mockResolvedValueOnce({
        id: 'image',
        ok: false,
        error: { code: 'forbidden', message: 'Unavailable' }
      })
      .mockResolvedValueOnce(REPLY)
    const client = stubRpcClient({ sendRequest })
    await act(async () => {
      tree = create(render(client))
    })
    if (!tree) {
      throw new Error('image did not mount')
    }
    expect(findAllByHostType(tree.root, 'Image')).toEqual([])
    const retry = tree.root.findAllByProps({ accessibilityLabel: 'Image unavailable' })[0]
    expect(retry).toBeDefined()
    await act(async () => retry?.props.onPress())
    expect(findAllByHostType(tree.root, 'Image').map((node) => node.props.source)).toEqual([
      { uri: URI }
    ])
  })

  it('ignores bytes returned after the selected owning host changes', async () => {
    let finish: ((value: typeof REPLY) => void) | undefined
    const oldClient = stubRpcClient({
      sendRequest: () =>
        new Promise((resolve) => {
          finish = resolve
        })
    })
    const nextClient = stubRpcClient({
      sendRequest: async () => ({ ...REPLY, result: { ...REPLY.result, content: 'AQ==' } })
    })
    await act(async () => {
      tree = create(render(oldClient))
    })
    await act(async () => tree?.update(render(nextClient)))
    await act(async () => finish?.(REPLY))
    if (!tree) {
      throw new Error('image did not mount')
    }
    expect(findAllByHostType(tree.root, 'Image').map((node) => node.props.source)).toEqual([
      { uri: 'data:image/png;base64,AQ==' }
    ])
  })

  it('does not carry a decoder failure into another owning host', async () => {
    const client = stubRpcClient({ sendRequest: async () => REPLY })
    const nextClient = stubRpcClient({ sendRequest: async () => REPLY })
    await act(async () => {
      tree = create(render(client))
    })
    if (!tree) {
      throw new Error('image did not mount')
    }
    act(() => findByHostType(tree!.root, 'Image').props.onError())
    expect(findAllByHostType(tree.root, 'Image')).toEqual([])
    await act(async () => tree?.update(render(nextClient)))
    expect(findAllByHostType(tree.root, 'Image').map((node) => node.props.source)).toEqual([
      { uri: URI }
    ])
  })

  it('discards an old logical-client generation even before its next render', async () => {
    let generation = 0
    let finish: ((value: typeof REPLY) => void) | undefined
    let calls = 0
    const client = stubRpcClient({
      getGeneration: () => generation,
      sendRequest: () =>
        ++calls === 1
          ? new Promise((resolve) => {
              finish = resolve
            })
          : Promise.resolve(REPLY)
    })
    await act(async () => {
      tree = create(render(client))
    })
    generation = 1
    await act(async () => finish?.(REPLY))
    if (!tree) {
      throw new Error('image did not mount')
    }
    expect(findAllByHostType(tree.root, 'Image')).toEqual([])
    await act(async () => tree?.update(render(client)))
    expect(findAllByHostType(tree.root, 'Image').map((node) => node.props.source)).toEqual([
      { uri: URI }
    ])
  })

  it.each([
    {},
    { content: 'AA==', isImage: false, mimeType: 'image/png' },
    { content: 'AA==', isImage: true, mimeType: 'text/html' },
    { content: 5, isImage: true, mimeType: 'image/png' }
  ])('shows an unavailable state for unusable host image data %j', async (result) => {
    const client = stubRpcClient({ sendRequest: async () => ({ id: 'image', ok: true, result }) })
    await act(async () => {
      tree = create(render(client))
    })
    if (!tree) {
      throw new Error('image did not mount')
    }
    expect(findAllByHostType(tree.root, 'Image')).toEqual([])
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Image unavailable' })).toHaveLength(1)
  })
})
