import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { git, compose } from './composition.mjs'
import { currentCompatibilityPatch } from './retired-test-fixtures.mjs'
import { renderReport } from './github.mjs'

const source = `import { it, expect } from 'vitest'
const value = 'before'
it('existing behavior', () => {
  expect(value).toBeTruthy()
})
`

function fixture(
  run,
  {
    path = 'src/obsolete.test.ts',
    incoming = source.replace('before', 'after'),
    baseText = source,
    rename = false
  } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'fork-retired-fixture-'))
  try {
    git(root, ['init', '-b', 'main'])
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), baseText)
    writeFileSync(join(root, 'src/feature.ts'), 'export const feature = false\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'base'])
    const base = git(root, ['rev-parse', 'HEAD'])
    git(root, ['checkout', '-b', 'feature'])
    writeFileSync(join(root, path), incoming)
    writeFileSync(join(root, 'src/feature.ts'), 'export const feature = true\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-m', 'feature'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['checkout', 'main'])
    git(root, rename ? ['mv', path, 'src/renamed.test.ts'] : ['rm', path])
    git(root, ['commit', '-m', 'retire original test'])
    const upstream = git(root, ['rev-parse', 'HEAD'])
    run({ root, base, head, upstream, path, selections: [{ number: 1, head: { sha: head } }] })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('real Git: fixture maintenance preserves upstream retirement and keeps selected product code', () =>
  fixture(({ root, upstream, path, selections }) => {
    const result = compose(root, upstream, selections)
    assert.equal(result.publishable, true)
    assert.equal(existsSync(join(root, path)), false)
    assert.equal(git(root, ['show', 'HEAD:src/feature.ts']), 'export const feature = true')
    const receipt = result.retiredFixtures[0].paths[0]
    assert.equal(receipt.path, path)
    assert.equal(receipt.blobs[1], null)
    assert.match(receipt.deltaSha256, /^[a-f0-9]{64}$/)
    assert.match(
      renderReport({ result, configuration: upstream, upstream, blockers: [], selections: [] }),
      /Preserved upstream test retirements/
    )
  }))

for (const [name, incoming] of [
  ['new test cases', `${source}it('new coverage', () => { expect(value).toBeTruthy() })\n`],
  [
    'new assertions',
    source.replace(
      '  expect(value).toBeTruthy()',
      "  expect(value).toBeTruthy()\n  expect(value).toEqual('before')"
    )
  ]
]) {
  test(`real Git: retirement still blocks ${name}`, () =>
    fixture(
      ({ root, upstream, selections }) => {
        const result = compose(root, upstream, selections)
        assert.equal(result.publishable, false)
        assert.equal(result.conflicts.length, 1)
        assert.equal(result.retiredFixtures.length, 0)
      },
      { incoming }
    ))
}

test('real Git: table-driven tests require explicit retirement review', () => {
  const table = source.replace("it('existing behavior'", "it.each([1])('existing behavior'")
  fixture(
    ({ root, upstream, selections }) => {
      assert.equal(compose(root, upstream, selections).publishable, false)
    },
    { baseText: table, incoming: table.replace('before', 'after') }
  )
})

test('real Git: production targets never inherit test-retirement handling', () =>
  fixture(
    ({ root, upstream, selections }) => {
      assert.equal(compose(root, upstream, selections).publishable, false)
    },
    { path: 'src/production.ts' }
  ))

test('real Git: automatic retirement cannot override an existing reviewed identity', () =>
  fixture(({ root, base, upstream, path, selections }) => {
    const directory = join(root, '.git/reviewed')
    mkdirSync(directory)
    writeFileSync(
      join(directory, 'manifest.json'),
      JSON.stringify([
        {
          path,
          blobs: [git(root, ['rev-parse', `${base}:${path}`]), null, 'a'.repeat(40)],
          patch: 'retired.patch',
          deleted: true,
          resultSha256: null,
          patchSha256: createHash('sha256').update('').digest('hex')
        }
      ])
    )
    assert.equal(
      compose(root, upstream, selections, { resolutionsDirectory: directory }).publishable,
      false
    )
  }))

function maintenance(path) {
  return `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -2 +2 @@
-const value = 'before'
+const value = 'after'
`
}

test('required corrections keep upstream fixture retirement while product preimages remain strict', () =>
  fixture(({ root, upstream, path, selections }) => {
    compose(root, upstream, selections)
    const product = `diff --git a/src/feature.ts b/src/feature.ts
--- a/src/feature.ts
+++ b/src/feature.ts
@@ -1 +1 @@
-export const feature = true
+export const feature = 'corrected'
`
    const original = maintenance(path)
    const current = currentCompatibilityPatch(root, upstream, original + product, git)
    assert.equal(current.text, product)
    assert.deepEqual(current.retirements, [
      {
        path,
        removedBy: upstream,
        patchSha256: createHash('sha256').update(original).digest('hex')
      }
    ])
    const patch = join(root, '.git/required.patch')
    writeFileSync(patch, current.text)
    git(root, ['apply', '--check', patch])
    writeFileSync(join(root, 'src/feature.ts'), 'export const feature = "changed"\n')
    assert.throws(() => git(root, ['apply', '--check', patch]))
  }))

test('required corrections do not discard newly added test coverage', () =>
  fixture(({ root, upstream, path }) => {
    const text = `${maintenance(path)}+it('new coverage', () => expect(true).toBe(true))\n`
    const current = currentCompatibilityPatch(root, upstream, text, git)
    assert.equal(current.text, text)
    assert.deepEqual(current.retirements, [])
  }))

test('an absent target without an upstream deletion proof stays a required conflict', () =>
  fixture(({ root, upstream }) => {
    const text = maintenance('src/never-existed.test.ts')
    assert.deepEqual(currentCompatibilityPatch(root, upstream, text, git), {
      text,
      retirements: []
    })
  }))

test('a renamed test requires an owner update instead of a deletion exemption', () =>
  fixture(
    ({ root, upstream, path }) => {
      const text = maintenance(path)
      assert.deepEqual(currentCompatibilityPatch(root, upstream, text, git), {
        text,
        retirements: []
      })
    },
    { rename: true }
  ))

test('an explicit new test file is retained even at a previously retired path', () =>
  fixture(({ root, upstream, path }) => {
    const text = maintenance(path).replace(`--- a/${path}`, `new file mode 100644\n--- /dev/null`)
    assert.deepEqual(currentCompatibilityPatch(root, upstream, text, git), {
      text,
      retirements: []
    })
  }))
