import { isAgentSessionAttachmentStorePath } from '../../../src/shared/agent-session-attachments'
import { buildImageDataUri } from '../../../src/shared/image-data-uri'
import { filePreviewImageSchema } from '../files/file-preview-reply-schema'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'
import type { RpcClient } from '../transport/rpc-client'

// Bare host paths require the owning host's attachment reader.
const RENDERABLE_IMAGE_URI = /^(file:|data:|https?:|content:|blob:)/i

export function isRenderableImageUri(uri: string | undefined): uri is string {
  return typeof uri === 'string' && RENDERABLE_IMAGE_URI.test(uri)
}

const attachmentImageRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'agent-session-attachment.read-image',
    method: 'agentSessionAttachment.read',
    acceptance: 'object-result-or-null',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('chat-attachment-image', filePreviewImageSchema)
  })
)

export async function readMobileNativeChatImage(
  client: RpcClient,
  path: string
): Promise<string | null> {
  if (!isAgentSessionAttachmentStorePath(path)) {
    return null
  }
  try {
    const reply = await attachmentImageRead.request(
      client,
      { path },
      { timeoutMs: 15_000, budgetSpansConnect: true }
    )
    const image = attachmentImageRead.interpret(reply)
    return image?.isImage && image.content ? buildImageDataUri(image.mimeType, image.content) : null
  } catch {
    return null
  }
}
