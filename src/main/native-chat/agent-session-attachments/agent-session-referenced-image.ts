import { realpath } from 'node:fs/promises'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import { readAuthorizedDocPreviewFile } from '../../../shared/doc-preview-file-access'
import { IMAGE_FILE_MIME_TYPES } from '../../../shared/image-file-extensions'
import {
  isDeviceNamespacePath,
  isNetworkSharePath,
  isWindowsReservedDeviceName
} from '../../ipc/automatic-load-path-text'
import {
  assertPreviewWithinTransportBudget,
  LOCAL_PREVIEWABLE_BINARY_MAX_BYTES,
  previewableBinaryByteLimit
} from '../../runtime/files/file-preview-budget'

const UNAVAILABLE = 'Not a referenced chat image'

/** Only an exact image reference in the host journal authorizes a non-store preview. */
export async function readAgentSessionReferencedImage(
  path: string,
  items: readonly AgentJournalRenderItem[],
  maxContentBytes?: number
) {
  const target = resolve(path)
  if (
    !isAbsolute(path) ||
    isDeviceNamespacePath(target) ||
    isNetworkSharePath(target) ||
    isWindowsReservedDeviceName(target) ||
    !IMAGE_FILE_MIME_TYPES[extname(path).toLowerCase()] ||
    !items.some(
      ({ body }) =>
        body.kind === 'message' &&
        body.blocks.some((block) => block.type === 'image-ref' && block.path === path)
    )
  ) {
    throw new Error(UNAVAILABLE)
  }
  try {
    const canonical = await realpath(path)
    if (
      !IMAGE_FILE_MIME_TYPES[extname(canonical).toLowerCase()] ||
      isNetworkSharePath(canonical) ||
      isDeviceNamespacePath(canonical) ||
      isWindowsReservedDeviceName(canonical)
    ) {
      throw new Error(UNAVAILABLE)
    }
    const image = await readAuthorizedDocPreviewFile({
      boundaryPath: dirname(path),
      entryPath: path,
      implicitRootPath: null,
      authorizedRootPaths: [],
      targetPath: path,
      maxTextBytes: 0,
      maxBinaryBytes:
        maxContentBytes === undefined
          ? LOCAL_PREVIEWABLE_BINARY_MAX_BYTES
          : previewableBinaryByteLimit(maxContentBytes)
    })
    if (!image.isBinary || !image.mimeType?.startsWith('image/')) {
      throw new Error(UNAVAILABLE)
    }
    return assertPreviewWithinTransportBudget({ ...image, isImage: true }, maxContentBytes)
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === 'file_too_large' ? 'file_too_large' : UNAVAILABLE
    )
  }
}
