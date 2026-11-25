import { readFile } from 'node:fs/promises'

export async function readBridgeContract() {
  const source = await readFile(
    new URL(
      '../../../../mobile/src/mobile-web-shell/bridge/protocol/bridge-frame-fields.ts',
      import.meta.url
    ),
    'utf8'
  )
  const version = /\bBRIDGE_PROTOCOL_VERSION = (\d+)/.exec(source)?.[1]
  const faultGrant = /\bBRIDGE_FAULT_GRANT = .([a-zA-Z]+)./.exec(source)?.[1]
  if (!version || !faultGrant) {
    throw new Error('Could not read the mobile shell bridge contract')
  }
  return { version: Number(version), faultGrant }
}

// Playwright serializes this function into the page before loading the real mobile bundle.
export function installShellDouble({
  version,
  sessionId,
  buildId,
  route,
  host,
  storage,
  grants,
  pageRoutes,
  replies
}) {
  globalThis.__orcaRenderCheckNotifies = []
  globalThis.__orcaRenderCheckRequests = []
  const channel = {
    onmessage: null,
    postMessage(json) {
      const frame = JSON.parse(json)
      const answer = (message) => {
        queueMicrotask(() =>
          channel.onmessage?.({ data: JSON.stringify({ v: version, ...message }) })
        )
      }
      if (frame.type === 'ready') {
        answer({
          type: 'init',
          sessionId,
          buildId,
          connection: {
            state: 'connected',
            reconnectAttempt: 0,
            lastConnectedAt: 1,
            lastInboundAt: 1,
            generation: 0
          },
          grants: {
            rpc: { maxPendingRequests: 64, maxSubscriptions: 32 },
            native: grants
          },
          pageRoutes,
          route,
          host,
          storage
        })
      } else if (frame.type === 'notify') {
        globalThis.__orcaRenderCheckNotifies.push(frame)
      } else if (frame.type === 'request') {
        globalThis.__orcaRenderCheckRequests.push({ method: frame.method, params: frame.params })
        if (Object.hasOwn(replies, frame.method)) {
          answer({
            type: 'reply',
            id: frame.id,
            payload: { id: frame.id, ok: true, result: replies[frame.method] }
          })
          return
        }
        refuse(frame.id)
      } else if (frame.type === 'subscribe') {
        refuse(frame.id)
      }
      function refuse(id) {
        answer({
          type: 'error',
          id,
          error: {
            category: 'RenderCheckShellDouble',
            message: 'The project conversations fixture has no reply for this RPC',
            isRpcDeliveryUnknown: false
          }
        })
      }
    }
  }
  globalThis.orcaBridge = channel
}
