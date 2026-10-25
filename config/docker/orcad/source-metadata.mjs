import { createHash } from 'node:crypto'
import { readdir, readFile, readlink } from 'node:fs/promises'
import { join } from 'node:path'
import { isDirectInvocation } from '../../scripts/script-entry-detection.mjs'

const excluded = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '.build',
  '.cache',
  'vendor',
  '.DS_Store',
  'Pods',
  '.gradle',
  '.expo'
])
const inputs = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'config',
  'src',
  'native',
  'resources',
  'mobile'
]

export async function sourceFingerprint(root) {
  const hash = createHash('sha256')
  async function visit(relative) {
    const path = join(root, relative)
    const entries = await readdir(path, { withFileTypes: true })
    for (const entry of entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    )) {
      if (
        excluded.has(entry.name) ||
        entry.name.startsWith('.env') ||
        entry.name.endsWith('.log')
      ) {
        continue
      }
      const child = `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        await visit(child)
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        hash
          .update(`${child}\0`)
          .update(
            entry.isSymbolicLink()
              ? await readlink(join(root, child))
              : await readFile(join(root, child))
          )
          .update('\0')
      }
    }
  }
  for (const input of inputs) {
    if (input.includes('.')) {
      hash
        .update(`${input}\0`)
        .update(await readFile(join(root, input)))
        .update('\0')
    } else {
      await visit(input)
    }
  }
  return hash.digest('hex')
}

if (isDirectInvocation(import.meta.url, process.argv[1])) {
  console.log(await sourceFingerprint(process.cwd()))
}
