import { describe, expect, it } from 'vitest'
import type { AiVaultSession } from '../../../../../../shared/ai-vault/contracts/ai-vault-types'
import { MIXED_FOLDER } from '../../../../../../shared/folder-workspaces/folder-workspace-host-routing.test-fixture'
import { resolveAiVaultSessionWorktreeInfo } from '../../../../../../shared/ai-vault/session-display/ai-vault-session-worktree'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { aiVaultSessionOwnerWorkspaces } from './ai-vault-session-worktree'

const baseSession: AiVaultSession = {
  id: 'codex:session-1',
  executionHostId: 'local',
  agent: 'codex',
  sessionId: 'session-1',
  title: 'Find the pane',
  cwd: '/repo/orca/src',
  branch: null,
  model: null,
  filePath: '/home/ada/.codex/session-1.jsonl',
  codexHome: null,
  createdAt: null,
  updatedAt: '2026-06-24T10:00:00.000Z',
  modifiedAt: '2026-06-24T10:00:00.000Z',
  messageCount: 2,
  totalTokens: 42,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: "codex resume 'session-1'",
  subagent: null
}

describe('resolveAiVaultSessionWorktreeInfo', () => {
  it('resolves a record-only chat by stored folder identity without a cwd and keeps host twins separate', () => {
    const folder = { ...MIXED_FOLDER, id: 'folder-1', name: 'Notes', folderPath: '/work/notes' }
    const saved = {
      ...baseSession,
      source: 'structured-record' as const,
      cwd: null,
      filePath: '',
      structuredSession: { sessionId: 'saved-empty', workspaceId: 'folder:folder-1' }
    }
    const worktrees = aiVaultSessionOwnerWorkspaces([], [folder])
    expect(
      resolveAiVaultSessionWorktreeInfo({ session: saved, worktrees, activeWorktreeId: null })
    ).toMatchObject({ worktreeId: 'folder:folder-1', path: '/work/notes', label: 'Notes' })
    expect(
      resolveAiVaultSessionWorktreeInfo({
        session: { ...saved, executionHostId: 'runtime:remote' },
        worktrees,
        activeWorktreeId: null
      })
    ).toBeNull()
  })
  it.each([
    { filePath: String.raw`\\wsl.localhost\Ubuntu\home\ada\.codex\session.jsonl`, owner: 'Ubuntu' },
    { filePath: String.raw`\\wsl.localhost\Debian\home\ada\.codex\session.jsonl`, owner: 'Debian' },
    { filePath: '/home/ada/.codex/session.jsonl', owner: undefined }
  ])('requires transcript namespace proof for WSL Linux cwd: $owner', ({ filePath, owner }) => {
    const worktrees = ['Debian', 'Ubuntu'].map((distro) =>
      makeWorktree({
        id: `folder:${distro}`,
        repoId: 'repo-1',
        path: `\\\\wsl.localhost\\${distro}\\home\\ada\\orca`
      })
    )
    const found = resolveAiVaultSessionWorktreeInfo({
      session: { ...baseSession, cwd: '/home/ada/orca/src', filePath },
      worktrees,
      activeWorktreeId: null
    })
    expect(found?.worktreeId).toBe(owner ? `folder:${owner}` : undefined)
    expect(found?.status).toBe(owner ? 'active' : 'unavailable')
  })
})
