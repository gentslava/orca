import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appManifest } from '../scripts/fork-upstream-archives.mjs'
import { linuxCommonManifest } from './linux-packages.mjs'

test('cross-format payload identity tolerates empty directories omitted by AppImage', () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-linux-payload-'))
  try {
    const unpacked = join(root, 'unpacked')
    const packaged = join(root, 'packaged')
    for (const app of [unpacked, packaged]) {
      mkdirSync(join(app, 'resources'), { recursive: true })
      writeFileSync(join(app, 'resources/app.asar'), 'same application')
      writeFileSync(join(app, 'orca-ide'), 'same executable', { mode: 0o755 })
    }
    mkdirSync(join(unpacked, 'resources/node_modules/node-pty/typings'), { recursive: true })
    const before = appManifest(unpacked)
    const extracted = appManifest(packaged)
    assert.notDeepEqual(before, extracted)
    assert.deepEqual(
      linuxCommonManifest(before, 'unpacked'),
      linuxCommonManifest(extracted, 'AppImage')
    )
    assert.ok(before.some((entry) => entry.path.endsWith('/typings')))
    writeFileSync(join(packaged, 'resources/app.asar'), 'changed application')
    assert.notDeepEqual(
      linuxCommonManifest(before, 'unpacked'),
      linuxCommonManifest(appManifest(packaged), 'AppImage')
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('common payload retains executable bits and symlink targets', () => {
  const base = [
    { path: 'orca-ide', type: 'file', executable: 0o111, sha256: 'same bytes' },
    { path: 'runtime', type: 'symlink', target: 'resources/runtime' }
  ]
  const expected = linuxCommonManifest(base, 'unpacked')
  for (const changed of [
    [{ ...base[0], executable: 0 }, base[1]],
    [base[0], { ...base[1], target: 'resources/other-runtime' }]
  ]) {
    assert.notDeepEqual(linuxCommonManifest(changed, 'AppImage'), expected)
  }
})
