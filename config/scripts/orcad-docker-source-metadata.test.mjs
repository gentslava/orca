import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runProcess } from '@orca/process-host'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { sourceFingerprint } from '../docker/orcad/source-metadata.mjs'

let root

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orcad-source-'))
  for (const directory of ['config', 'src', 'native', 'resources', 'mobile']) {
    await mkdir(join(root, directory))
  }
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    await writeFile(join(root, file), '{}')
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it('hashes names in code-unit order, independent of locale collation', async () => {
  await writeFile(join(root, 'src/Z.ts'), 'upper')
  await writeFile(join(root, 'src/a.ts'), 'lower')
  const expected = createHash('sha256')
  for (const [file, content] of [
    ['package.json', '{}'],
    ['pnpm-lock.yaml', '{}'],
    ['pnpm-workspace.yaml', '{}'],
    ['src/Z.ts', 'upper'],
    ['src/a.ts', 'lower']
  ]) {
    expected.update(`${file}\0`).update(content).update('\0')
  }
  expect(await sourceFingerprint(root)).toBe(expected.digest('hex'))
})

it.skipIf(process.platform === 'win32')(
  'records the input tree before the Docker build generates mobile sources',
  async () => {
    const docker = resolve(import.meta.dirname, '../docker/orcad')
    await mkdir(join(root, 'config/docker/orcad'), { recursive: true })
    await mkdir(join(root, 'config/scripts'), { recursive: true })
    for (const file of ['build-support.mjs', 'source-metadata.mjs']) {
      await copyFile(join(docker, file), join(root, 'config/docker/orcad', file))
    }
    await copyFile(
      resolve(import.meta.dirname, 'script-entry-detection.mjs'),
      join(root, 'config/scripts/script-entry-detection.mjs')
    )
    await mkdir(join(root, 'node_modules/esbuild'), { recursive: true })
    await writeFile(
      join(root, 'node_modules/esbuild/package.json'),
      JSON.stringify({ type: 'module', exports: './index.js' })
    )
    await writeFile(
      join(root, 'node_modules/esbuild/index.js'),
      "import {mkdir} from 'node:fs/promises'; export async function build({outdir}) { await mkdir(outdir, {recursive:true}) }"
    )
    await writeFile(
      join(root, 'pnpm.mjs'),
      "import {mkdir,writeFile} from 'node:fs/promises'; await mkdir('mobile/src',{recursive:true}); await writeFile('mobile/src/generated.ts','generated'); await mkdir('out/orcad',{recursive:true}); await writeFile('out/orcad/.version','fixture')"
    )
    const configured = await sourceFingerprint(root)
    const dockerfile = await readFile(join(docker, 'Dockerfile'), 'utf8')
    const buildCommand = [...dockerfile.replaceAll('\\\n', '').matchAll(/^RUN (.*)$/gm)]
      .map((match) => match[1])
      .find((command) => command.includes('build-support.mjs'))
    expect(buildCommand).toBeDefined()
    const result = await runProcess({
      program: '/bin/sh',
      args: ['-ec', buildCommand.replaceAll('pnpm ', 'node pnpm.mjs ')],
      cwd: root,
      env: { ...process.env, ORCAD_SOURCE_FINGERPRINT: configured },
      timeoutMs: 30000
    })
    expect(result.code, result.stderr).toBe(0)
    const metadata = JSON.parse(await readFile(join(root, 'out/orcad-docker/build.json'), 'utf8'))
    expect(metadata.configuredSourceFingerprint).toBe(configured)
    expect(metadata.builtSourceFingerprint).toBe(configured)
    expect(await sourceFingerprint(root)).not.toBe(configured)
  }
)
