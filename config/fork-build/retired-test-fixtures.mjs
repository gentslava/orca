import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ordinaryTest = /^(?:src|mobile\/src)\/[A-Za-z0-9_./-]+\.test\.[cm]?[jt]sx?$/
const testCall = /\b(?:it|test)(?:\.[A-Za-z]+)*\s*\(/
const newCheck = /\b(?:it|test|describe|expect|assert)(?:\.[A-Za-z]+)*\s*(?:\(|`)/
const hash = (value) => createHash('sha256').update(value).digest('hex')

function testPath(path) {
  return ordinaryTest.test(path) && !path.split('/').includes('..')
}

function addedLines(patch) {
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n')
}

export function reviewedTargetPaths(directory) {
  const manifest = directory && join(directory, 'manifest.json')
  return new Set(
    manifest && existsSync(manifest)
      ? JSON.parse(readFileSync(manifest, 'utf8')).map((entry) => entry.path)
      : []
  )
}

export function fixtureRetirement(cwd, path, upstream, git, reviewedPaths) {
  if (!testPath(path) || reviewedPaths.has(path) || !/^[a-f0-9]{40}$/.test(upstream || '')) {
    return null
  }
  const stages = git(cwd, ['ls-files', '-u', '--', path]).split('\n').filter(Boolean)
  const blobs = [1, 2, 3].map((stage) => {
    const row = stages.find((line) => line.split('\t')[0].endsWith(` ${stage}`))
    return row ? row.split(' ')[1] : null
  })
  if (!blobs[0] || blobs[1] || !blobs[2] || git(cwd, ['ls-tree', upstream, '--', path])) {
    return null
  }
  const base = git(cwd, ['cat-file', 'blob', blobs[0]], {}, { raw: true })
  const incoming = git(cwd, ['cat-file', 'blob', blobs[2]], {}, { raw: true })
  if (
    base.length + incoming.length > 256 * 1024 ||
    !testCall.test(base) ||
    /\b(?:it|test)\.each\b/.test(base + incoming)
  ) {
    return null
  }
  const delta = git(
    cwd,
    ['diff', '--no-ext-diff', '--unified=0', blobs[0], blobs[2]],
    {},
    { raw: true }
  )
  if (newCheck.test(addedLines(delta))) {
    return null
  }
  return {
    path,
    blobs,
    upstream,
    deltaSha256: hash(delta),
    reason: 'Preserve upstream removal; the selected delta only maintains an existing test fixture.'
  }
}

export function currentCompatibilityPatch(cwd, upstream, text, git) {
  if (!text.startsWith('diff --git ')) {
    return { text, retirements: [] }
  }
  const kept = [],
    retirements = []
  for (const block of text.split(/(?=^diff --git )/m).filter(Boolean)) {
    const match = /^diff --git a\/([^\n]+) b\/([^\n]+)\n/.exec(block)
    const path = match?.[1]
    if (
      !path ||
      path !== match[2] ||
      !testPath(path) ||
      /\nnew file mode |\nGIT binary patch\n|\b(?:it|test)\.each\b/.test(block) ||
      newCheck.test(addedLines(block)) ||
      existsSync(join(cwd, path)) ||
      git(cwd, ['ls-tree', upstream, '--', path])
    ) {
      kept.push(block)
      continue
    }
    const removedBy = git(cwd, [
      'log',
      '-1',
      '--format=%H',
      '--diff-filter=D',
      upstream,
      '--',
      path
    ])
    const removed =
      /^[a-f0-9]{40}$/.test(removedBy) &&
      git(cwd, [
        'diff-tree',
        '--no-commit-id',
        '-r',
        '--name-status',
        '--find-renames',
        `${removedBy}^`,
        removedBy
      ])
        .split('\n')
        .includes(`D\t${path}`)
    if (!removed) {
      kept.push(block)
      continue
    }
    retirements.push({ path, removedBy, patchSha256: hash(block) })
  }
  return { text: kept.join(''), retirements }
}
