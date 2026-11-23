import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { git, compose } from './composition.mjs'

test('a reviewed upstream deletion is preserved only for its exact three blobs', () => {
  const root = mkdtempSync(join(tmpdir(), 'fork-reviewed-deletion-'))
  try {
    git(root, ['init', '-b', 'main'])
    writeFileSync(join(root, 'obsolete.test.ts'), 'old test\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'base'])
    const base = git(root, ['rev-parse', 'HEAD'])
    git(root, ['checkout', '-b', 'feature'])
    writeFileSync(join(root, 'obsolete.test.ts'), 'updated obsolete test\n')
    writeFileSync(join(root, 'feature.ts'), 'export const available = true\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'feature'])
    const incoming = git(root, ['rev-parse', 'HEAD'])
    git(root, ['checkout', 'main'])
    git(root, ['rm', 'obsolete.test.ts'])
    git(root, ['commit', '-m', 'remove obsolete test'])
    const upstream = git(root, ['rev-parse', 'HEAD'])
    const directory = join(root, '.git', 'reviewed')
    mkdirSync(directory)
    const hash = (text) => createHash('sha256').update(text).digest('hex')
    writeFileSync(join(directory, 'removed.patch'), '')
    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify([
        {
          path: 'obsolete.test.ts',
          blobs: [
            git(root, ['rev-parse', `${base}:obsolete.test.ts`]),
            null,
            git(root, ['rev-parse', `${incoming}:obsolete.test.ts`])
          ],
          patch: 'removed.patch',
          patchSha256: hash(''),
          deleted: true,
          resultSha256: null,
          reason: 'Retain reviewed upstream test removal'
        }
      ])
    )
    const selections = [{ number: 1, head: { sha: incoming } }]
    const result = compose(root, upstream, selections, { resolutionsDirectory: directory })
    assert.equal(result.publishable, true)
    assert.equal(existsSync(join(root, 'obsolete.test.ts')), false)
    assert.equal(git(root, ['show', 'HEAD:feature.ts']), 'export const available = true')
    assert.equal(result.reviewedResolutions[0].patches[0].deleted, true)
    git(root, ['checkout', '-B', 'changed', incoming])
    writeFileSync(join(root, 'obsolete.test.ts'), 'different change\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'changed feature'])
    const changed = git(root, ['rev-parse', 'HEAD'])
    const refused = compose(root, upstream, [{ number: 1, head: { sha: changed } }], {
      resolutionsDirectory: directory
    })
    assert.equal(refused.publishable, false)
    assert.equal(refused.conflicts.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
