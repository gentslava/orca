import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { AgentJournalRenderItem } from '../../../shared/agent-session-journal-types'
import { readAgentSessionReferencedImage } from './agent-session-referenced-image'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-chat-image-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function rows(path: string): AgentJournalRenderItem[] {
  return [
    {
      itemId: 'image',
      sequence: 1,
      revision: 1,
      observedAt: 1,
      body: { kind: 'message', role: 'tool', blocks: [{ type: 'image-ref', path }] }
    }
  ]
}

it('reads legacy pastes and tool images only through exact image references', async () => {
  const path = join(root, 'orca-paste-123.png')
  await writeFile(path, 'png')
  await expect(readAgentSessionReferencedImage(path, rows(path))).resolves.toEqual({
    content: Buffer.from('png').toString('base64'),
    isBinary: true,
    isImage: true,
    mimeType: 'image/png'
  })
  await expect(readAgentSessionReferencedImage(path, [])).rejects.toThrow('Not a referenced')
  await expect(
    readAgentSessionReferencedImage(path, rows(join(root, 'other.png')))
  ).rejects.toThrow('Not a referenced')
  const text: AgentJournalRenderItem[] = [
    {
      ...rows(path)[0]!,
      body: {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: path }]
      }
    }
  ]
  await expect(readAgentSessionReferencedImage(path, text)).rejects.toThrow('Not a referenced')
})

it('bounds remote image replies and reports missing images without exposing the filesystem', async () => {
  const path = join(root, 'large.jpg')
  await writeFile(path, Buffer.alloc(4096))
  await expect(readAgentSessionReferencedImage(path, rows(path), 512)).rejects.toThrow(
    'file_too_large'
  )
  const missing = join(root, 'gone.png')
  await expect(readAgentSessionReferencedImage(missing, rows(missing))).rejects.toThrow(
    'Not a referenced chat image'
  )
})

it('rejects documents and relative paths even when they occur in image blocks', async () => {
  for (const path of [join(root, 'private.txt'), join(root, 'document.pdf'), 'relative.png']) {
    await expect(readAgentSessionReferencedImage(path, rows(path))).rejects.toThrow(
      'Not a referenced'
    )
  }
})

it.skipIf(process.platform === 'win32')(
  'rejects symlink escapes and images pointing at non-image files',
  async () => {
    const folder = join(root, 'images')
    await mkdir(folder)
    const outside = join(root, 'outside.png')
    await writeFile(outside, 'png')
    const escaped = join(folder, 'escape.png')
    await symlink(outside, escaped)
    await expect(readAgentSessionReferencedImage(escaped, rows(escaped))).rejects.toThrow(
      'Not a referenced'
    )
    const secret = join(folder, 'secret.txt')
    await writeFile(secret, 'private')
    const disguised = join(folder, 'disguised.png')
    await symlink(secret, disguised)
    await expect(readAgentSessionReferencedImage(disguised, rows(disguised))).rejects.toThrow(
      'Not a referenced'
    )
  }
)
