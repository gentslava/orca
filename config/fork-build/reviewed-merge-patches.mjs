import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function reviewedMergePatches(cwd, paths, directory, git) {
  const manifest = join(directory, 'manifest.json')
  if (!existsSync(manifest)) {
    return new Map()
  }
  const entries = JSON.parse(readFileSync(manifest, 'utf8'))
  const selected = new Map()
  for (const path of paths) {
    const stages = git(cwd, ['ls-files', '-u', '--', path]).split('\n').filter(Boolean)
    const blobs = [1, 2, 3].map((stage) => {
      const row = stages.find((line) => line.split('\t')[0].endsWith(` ${stage}`))
      return row ? row.split(' ')[1] : null
    })
    const entry = entries.find(
      (item) => item.path === path && JSON.stringify(item.blobs) === JSON.stringify(blobs)
    )
    if (!entry) {
      continue
    }
    if (!/^(?:[a-z0-9-]+\/)?[A-Za-z0-9_.-]+\.patch$/.test(entry.patch)) {
      throw new Error('Invalid reviewed patch name')
    }
    const patch = join(directory, entry.patch)
    const text = readFileSync(patch)
    const hash = createHash('sha256').update(text).digest('hex')
    if (entry.patchSha256 !== hash) {
      throw new Error('Reviewed patch digest mismatch')
    }
    selected.set(path, {
      patch,
      ours: blobs[1] ? git(cwd, ['show', `:2:${path}`], {}, { raw: true }) : '',
      resultSha256: entry.resultSha256,
      hash,
      reason: entry.reason
    })
  }
  return selected
}

export function applyReviewedMergePatch(cwd, path, entry, git) {
  writeFileSync(join(cwd, path), entry.ours)
  if (readFileSync(entry.patch).length) {
    git(cwd, ['apply', '--check', '--include', path, entry.patch])
    git(cwd, ['apply', '--include', path, entry.patch])
  }
  const result = readFileSync(join(cwd, path))
  if (createHash('sha256').update(result).digest('hex') !== entry.resultSha256) {
    throw new Error(`Reviewed merge result mismatch: ${path}`)
  }
  return { path, patchSha256: entry.hash, reason: entry.reason }
}
