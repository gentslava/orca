import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'

const state = vi.hoisted(() => {
  const openFiles: { id: string; isDirty: boolean; externalMutation?: string }[] = [
    { id: 'book', isDirty: false }
  ]
  const tab = (id: string) => openFiles.find((file) => file.id === id)
  return {
    openFiles,
    markFileDirty: vi.fn((id: string, dirty: boolean) => {
      const found = tab(id)
      if (found) {
        found.isDirty = dirty
      }
    }),
    setExternalMutation: vi.fn((id: string, mutation: string | null) => {
      const found = tab(id)
      if (found) {
        found.externalMutation = mutation ?? undefined
      }
    })
  }
})
vi.mock('@/store', () => ({ useAppStore: { subscribe: () => () => {}, getState: () => state } }))
const writeRuntimeFileBytes = vi.fn()
vi.mock('@/runtime/runtime-file-bytes-write', () => ({
  writeRuntimeFileBytes: (...args: unknown[]) => writeRuntimeFileBytes(...args)
}))

import {
  editorBytesDocument,
  loadEditorBytes,
  releaseEditorBytes,
  retainEditorBytes,
  saveEditorBytesDraft,
  setEditorBytesDraft,
  sha256Hex
} from './editor-bytes-documents'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the save reads only openFiles, markFileDirty and setExternalMutation.
const getState = () => state as unknown as AppState
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the save reads only id, filePath and runtimeEnvironmentId.
const file = { id: 'book', filePath: '/repo/book.xlsx' } as OpenFile
const context = { target: { kind: 'local' as const }, worktreeId: 'wt', worktreePath: '/repo' }
const save = () => saveEditorBytesDraft(getState, file, context, 'user', () => false)
const loaded = new Uint8Array([0x50, 0x4b, 1])
const edited = { bytes: new Uint8Array([0x50, 0x4b, 2, 0xff]), fileType: 'xlsx' }
const hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

beforeEach(async () => {
  writeRuntimeFileBytes.mockReset()
  state.openFiles[0].isDirty = false
  state.openFiles[0].externalMutation = undefined
  loadEditorBytes('book', { bytes: loaded, fileType: 'xlsx' }, await sha256Hex(loaded))
})

describe('binary custom editor saves', () => {
  it('saves the edit guarded by the loaded hash, then holds the saved bytes as the baseline', async () => {
    setEditorBytesDraft('book', edited)
    expect(state.markFileDirty).toHaveBeenLastCalledWith('book', true)
    expect(editorBytesDocument('book')).toBe(edited)
    writeRuntimeFileBytes.mockResolvedValue({ ok: true })
    await expect(save()).resolves.toBe('written')
    expect(writeRuntimeFileBytes).toHaveBeenCalledWith(
      context,
      '/repo/book.xlsx',
      edited.bytes,
      undefined,
      { expectedSha256: hex(loaded), allowMissing: true },
      expect.any(Function)
    )
    expect(state.openFiles[0].isDirty).toBe(false)
    // The next edit is guarded by what was just written.
    setEditorBytesDraft('book', { bytes: new Uint8Array([3]), fileType: 'xlsx' })
    await save()
    expect(writeRuntimeFileBytes.mock.calls[1][4]).toEqual({
      expectedSha256: hex(edited.bytes),
      allowMissing: true
    })
  })

  it('keeps the edit unsaved and marks the outside change when the file moved on', async () => {
    setEditorBytesDraft('book', edited)
    writeRuntimeFileBytes.mockResolvedValue({ ok: false, diskConflict: 'changed' })
    await expect(save()).resolves.toBe('blocked-stale')
    expect(state.openFiles[0].isDirty).toBe(true)
    expect(state.openFiles[0].externalMutation).toBe('changed')
    expect(editorBytesDocument('book')).toBe(edited)
  })

  it('writes unguarded only for the banner Overwrite', async () => {
    setEditorBytesDraft('book', edited)
    writeRuntimeFileBytes.mockResolvedValue({ ok: true })
    await saveEditorBytesDraft(getState, file, context, 'overwrite', () => false)
    expect(writeRuntimeFileBytes.mock.calls[0][4]).toEqual({})
  })
})

describe('binary custom editor views', () => {
  it('keeps the bytes while another split pane still shows the file', () => {
    retainEditorBytes('book')
    retainEditorBytes('book')
    releaseEditorBytes('book')
    setEditorBytesDraft('book', edited)
    expect(editorBytesDocument('book')).toBe(edited)
    releaseEditorBytes('book')
  })

  it('keeps an edit guarded by the bytes it started from when a later read lands', async () => {
    setEditorBytesDraft('book', edited)
    const newer = new Uint8Array([9])
    loadEditorBytes('book', { bytes: newer, fileType: 'xlsx' }, await sha256Hex(newer))
    writeRuntimeFileBytes.mockResolvedValue({ ok: true })
    await save()
    expect(writeRuntimeFileBytes.mock.calls[0]?.[4]).toEqual({
      expectedSha256: hex(loaded),
      allowMissing: true
    })
  })
})
