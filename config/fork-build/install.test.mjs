import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { assertAssetBytes, replaceApplication } from './install.mjs'

test('rejects a replaced release download even when its filename is unchanged', () => {
  const bytes = Buffer.from('published application')
  const asset = {
    name: 'orca.dmg',
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  }
  assert.doesNotThrow(() => assertAssetBytes(asset, bytes))
  assert.throws(() => assertAssetBytes(asset, Buffer.from('different application')), /differs/)
  assert.throws(() => assertAssetBytes({ name: 'orca.dmg' }, bytes), /Missing GitHub asset digest/)
})

test('retains the previous installed application after publishing the replacement', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orca-install-test-'))
  try {
    const current = join(directory, 'Orca.app')
    const candidate = join(directory, 'candidate.app')
    const backup = join(directory, 'previous.app')
    for (const app of [current, candidate]) {
      mkdirSync(app)
    }
    writeFileSync(join(current, 'payload'), 'old')
    writeFileSync(join(candidate, 'payload'), 'new')
    replaceApplication(candidate, current, backup)
    assert.equal(readFileSync(join(current, 'payload'), 'utf8'), 'new')
    assert.equal(readFileSync(join(backup, 'payload'), 'utf8'), 'old')
    assert.equal(existsSync(candidate), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('restores the previous application if publishing the replacement fails', () => {
  const directory = mkdtempSync(join(tmpdir(), 'orca-install-test-'))
  try {
    const current = join(directory, 'Orca.app')
    const backup = join(directory, 'previous.app')
    mkdirSync(current)
    writeFileSync(join(current, 'payload'), 'old')
    assert.throws(() => replaceApplication(join(directory, 'missing.app'), current, backup))
    assert.equal(readFileSync(join(current, 'payload'), 'utf8'), 'old')
    assert.equal(existsSync(backup), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
