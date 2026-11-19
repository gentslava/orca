/** Explicit start actions render an emptied workspace, so closing its last file keeps it selected. */
import { describe, expect, it, vi } from 'vitest'
import { createEditorTabsStore } from '../editor-slice-test-harness'

vi.mock('@/runtime/web-session-tabs-sync/closing/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: vi.fn()
}))

describe('closing the focused workspace’s last file', () => {
  it('keeps the workspace selected on its start page', () => {
    const store = createEditorTabsStore()
    store.setState({ activeWorktreeId: 'wt-1' })
    const fileId = store.getState().openFile({
      filePath: '/repo/README.md',
      relativePath: 'README.md',
      worktreeId: 'wt-1',
      language: 'markdown',
      mode: 'edit'
    })

    store.getState().closeFile(fileId)

    const state = store.getState()
    expect(state.openFiles).toEqual([])
    expect(state.activeWorktreeId).toBe('wt-1')
    expect(state.activeTabTypeByWorktree['wt-1']).toBe('terminal')
  })
})
