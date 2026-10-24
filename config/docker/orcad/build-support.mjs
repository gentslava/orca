import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { sourceFingerprint } from './source-metadata.mjs'

const root = resolve(import.meta.dirname, '../../..')
const out = resolve(root, 'out/orcad-docker')
await build({
  entryPoints: ['entrypoint', 'healthcheck', 'install-providers'].map((name) =>
    resolve(import.meta.dirname, `${name}.mjs`)
  ),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outdir: out,
  outExtension: { '.js': '.cjs' },
  logLevel: 'warning'
})
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
await writeFile(
  resolve(out, 'build.json'),
  `${JSON.stringify(
    {
      version: pkg.version,
      revision: process.env.ORCAD_SOURCE_COMMIT,
      dirty: process.env.ORCAD_SOURCE_DIRTY === 'true',
      configuredSourceFingerprint: process.env.ORCAD_SOURCE_FINGERPRINT,
      builtSourceFingerprint: await sourceFingerprint(root),
      orcadVersion: (await readFile(resolve(root, 'out/orcad/.version'), 'utf8')).trim()
    },
    null,
    2
  )}\n`
)
