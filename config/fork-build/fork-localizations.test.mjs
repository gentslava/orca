import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { git } from './composition.mjs'
import { applyForkLocalizations } from './fork-localizations.mjs'

test('reviewed translation replacements preserve unrelated keys and refuse upstream divergence', () => {
  for (const current of ['old', 'replacement', 'upstream changed', 'missing replacement']) {
    const directory = mkdtempSync(join(tmpdir(), 'fork-translation-'))
    const source = join(directory, 'source')
    const controls = join(directory, 'controls')
    mkdirSync(source)
    mkdirSync(join(controls, 'localizations'), { recursive: true })
    try {
      for (const [name, path] of [
        ['desktop', 'src/renderer/src/i18n/locales'],
        ['mobile', 'mobile/src/i18n/locales']
      ]) {
        mkdirSync(join(source, path), { recursive: true })
        writeFileSync(
          join(source, path, 'en.json'),
          JSON.stringify({ width: 'Width', keep: 'Keep', count_other: '{{count}} changes' })
        )
        writeFileSync(
          join(source, path, 'ru.json'),
          JSON.stringify({ width: name === 'desktop' ? current : 'old', keep: 'untouched' })
        )
        writeFileSync(
          join(controls, 'localizations', `${name}-ru.json`),
          JSON.stringify(
            name === 'desktop' && current !== 'missing replacement'
              ? {
                  width: 'replacement',
                  count_few: '{{count}} изменения',
                  count_many: '{{count}} изменений'
                }
              : {}
          )
        )
      }
      writeFileSync(
        join(controls, 'localizations', 'desktop-ru-base.json'),
        JSON.stringify({ width: 'old' })
      )
      git(source, ['init'])
      git(source, ['add', '.'])
      git(source, ['commit', '-m', 'Original translations'])
      const apply = () => applyForkLocalizations(source, controls, git, '2026-11-10T00:00:00Z')
      if (current === 'upstream changed' || current === 'missing replacement') {
        assert.throws(apply, /Conflicting translation|override lacks replacement/)
        assert.equal(git(source, ['status', '--porcelain']), '')
      } else {
        const receipt = apply()
        assert.deepEqual(
          JSON.parse(readFileSync(join(source, 'src/renderer/src/i18n/locales/ru.json'), 'utf8')),
          {
            width: 'replacement',
            keep: 'untouched',
            count_few: '{{count}} изменения',
            count_many: '{{count}} изменений'
          }
        )
        assert.match(receipt[0].baseSha256, /^[a-f0-9]{64}$/)
        assert.equal(receipt[1].baseSha256, undefined)
        assert.equal(git(source, ['status', '--porcelain']), '')
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})
