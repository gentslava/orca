import type { AppState } from '@/store'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { editorTabFileAccess } from '@/lib/local-file-access'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { writeRuntimeFileBytes } from '@/runtime/runtime-file-bytes-write'
import type { CustomEditorBinaryDocument } from './plugin-custom-editor-host'
import type { EditorSaveResult, EditorSaveTrigger } from './editor-save-disk-precondition'
import {
  clearSelfWrite,
  recordSelfWrite,
  SELF_WRITE_REMOTE_TTL_MS
} from './editor-self-write-registry'
import { markEditorSaveRefusal } from './editor-save-rebaseline'
import { EditorSaveDiscardedError } from './editor-discard-epoch'

/**
 * A binary custom editor's document per tab: the bytes last read or saved, and the unsaved edit.
 * Kept here, not in the text drafts, so a text save can never write them as text. Unsaved bytes
 * live only while the tab is dirty and open; they are not kept across restarts.
 */
type BytesDocument = {
  saved: CustomEditorBinaryDocument
  savedSha256: string
  draft: CustomEditorBinaryDocument | null
}

const documents = new Map<string, BytesDocument>()
const listeners = new Set<() => void>()
let unsubscribeStore: (() => void) | null = null

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** Drops a draft once its tab is clean (saved, reverted, discarded) and the entry once it closes. */
function dropSettledDrafts(state: AppState): void {
  let changed = false
  for (const [fileId, document] of documents) {
    const tab = state.openFiles.find((file) => file.id === fileId)
    if (!tab) {
      documents.delete(fileId)
      changed = true
    } else if (document.draft && !tab.isDirty) {
      documents.set(fileId, { ...document, draft: null })
      changed = true
    }
  }
  if (documents.size === 0) {
    unsubscribeStore?.()
    unsubscribeStore = null
  }
  if (changed) {
    notify()
  }
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function subscribeEditorBytes(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The document the editor shows: the unsaved edit, else the bytes on disk. */
export function editorBytesDocument(fileId: string): CustomEditorBinaryDocument | null {
  const document = documents.get(fileId)
  return document ? (document.draft ?? document.saved) : null
}

/** The bytes just read from disk; a pending edit survives so a reload never drops it. */
export function loadEditorBytes(
  fileId: string,
  saved: CustomEditorBinaryDocument,
  savedSha256: string
): void {
  const existing = documents.get(fileId)
  // Why keep the draft's baseline: a later read must not vouch for bytes the edit never saw.
  documents.set(fileId, existing?.draft ? existing : { saved, savedSha256, draft: null })
  unsubscribeStore ??= useAppStore.subscribe(dropSettledDrafts)
  notify()
}

export function setEditorBytesDraft(fileId: string, draft: CustomEditorBinaryDocument): void {
  const document = documents.get(fileId)
  if (!document) {
    return
  }
  documents.set(fileId, { ...document, draft })
  useAppStore.getState().markFileDirty(fileId, true)
  notify()
}

const mountedViews = new Map<string, number>()

/** Counts a mounted view, so split panes on one file share its bytes until the last one leaves. */
export function retainEditorBytes(fileId: string): void {
  mountedViews.set(fileId, (mountedViews.get(fileId) ?? 0) + 1)
}

/** The last view unmounting with nothing unsaved frees the bytes; the next mount reads them again. */
export function releaseEditorBytes(fileId: string): void {
  const remaining = (mountedViews.get(fileId) ?? 1) - 1
  if (remaining > 0) {
    mountedViews.set(fileId, remaining)
    return
  }
  mountedViews.delete(fileId)
  if (documents.get(fileId)?.draft === null) {
    documents.delete(fileId)
    notify()
  }
}

export function hasEditorBytesDraft(fileId: string): boolean {
  return Boolean(documents.get(fileId)?.draft)
}

/** Writes the tab's unsaved bytes, guarded by the hash of the bytes the edit started from. */
export async function saveEditorBytesDraft(
  getState: () => AppState,
  file: OpenFile,
  context: RuntimeFileOperationArgs,
  trigger: EditorSaveTrigger,
  /** A Don't Save since the request; checked at the last moment before the write. */
  discarded: () => boolean
): Promise<EditorSaveResult> {
  const document = documents.get(file.id)
  const draft = document?.draft
  if (!document || !draft) {
    return 'written'
  }
  const remote = Boolean(context.connectionId || file.runtimeEnvironmentId?.trim())
  // Stamp before writing so the watcher's echo of this save is not taken as an outside change.
  recordSelfWrite(
    file.filePath,
    undefined,
    file.runtimeEnvironmentId,
    remote ? SELF_WRITE_REMOTE_TTL_MS : undefined
  )
  let result
  try {
    result = await writeRuntimeFileBytes(
      context,
      file.filePath,
      draft.bytes,
      editorTabFileAccess(getState(), file),
      trigger === 'overwrite'
        ? {}
        : { expectedSha256: document.savedSha256, allowMissing: trigger !== 'autosave' },
      () => {
        if (discarded()) {
          throw new EditorSaveDiscardedError()
        }
      }
    )
  } catch (error) {
    clearSelfWrite(file.filePath, file.runtimeEnvironmentId)
    if (error instanceof EditorSaveDiscardedError) {
      return trigger === 'autosave' ? 'failed' : 'written'
    }
    throw error
  }
  if (!result.ok) {
    clearSelfWrite(file.filePath, file.runtimeEnvironmentId)
    markEditorSaveRefusal(getState(), file, result.diskConflict)
    return 'blocked-stale'
  }
  const savedSha256 = await sha256Hex(draft.bytes)
  const current = documents.get(file.id)
  if (current) {
    // An edit made while the write ran stays unsaved, now against the bytes just written.
    const newer = current.draft !== draft ? current.draft : null
    documents.set(file.id, { saved: draft, savedSha256, draft: newer })
    const state = getState()
    state.markFileDirty(file.id, newer !== null, { written: true })
    if (state.openFiles.find((tab) => tab.id === file.id)?.externalMutation) {
      state.setExternalMutation(file.id, null)
    }
    notify()
  }
  return 'written'
}
