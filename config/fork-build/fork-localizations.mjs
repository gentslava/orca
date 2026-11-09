import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeTranslationCatalogs, parseCatalog } from './locale-merge.mjs'
import { resolveLocaleSourceKey } from '../scripts/locale-catalog/locale-plural-forms.mjs'

function leaves(catalog, prefix = '') {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value]] : leaves(value, path)
  })
}

const placeholders = (text) => [...new Set(text.match(/\{\{[^}]+\}\}/g) ?? [])].sort()

export function pruneTranslationsWithoutSource(catalog, english, localeName) {
  const removed = []
  function prune(node, prefix = '') {
    return Object.fromEntries(
      Object.entries(node).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof value !== 'string') {
          return [[key, prune(value, path)]]
        }
        if (resolveLocaleSourceKey(english, localeName, path)) {
          return [[key, value]]
        }
        removed.push(path)
        return []
      })
    )
  }
  return { catalog: prune(catalog), removed }
}

export function applyForkLocalizations(source, controls, git, timestamp) {
  const applied = []
  for (const [name, directory] of [
    ['desktop', 'src/renderer/src/i18n/locales'],
    ['mobile', 'mobile/src/i18n/locales']
  ]) {
    const file = `localizations/${name}-ru.json`
    const overlayText = readFileSync(join(controls, file), 'utf8')
    const overlay = parseCatalog(overlayText)
    const english = new Map(
      leaves(parseCatalog(readFileSync(join(source, directory, 'en.json'), 'utf8')))
    )
    const rows = leaves(overlay)
    for (const [key, value] of rows) {
      const original = english.get(key)
      if (original === undefined) {
        throw new Error(`Fork translation lacks English source: ${key}`)
      }
      if (JSON.stringify(placeholders(original)) !== JSON.stringify(placeholders(value))) {
        throw new Error(`Fork translation placeholders differ: ${key}`)
      }
    }
    const path = `${directory}/ru.json`
    const current = readFileSync(join(source, path), 'utf8')
    const pruned = pruneTranslationsWithoutSource(parseCatalog(current), english, 'ru')
    const merged = mergeTranslationCatalogs('{}', JSON.stringify(pruned.catalog), overlayText)
    if (merged !== current) {
      writeFileSync(join(source, path), merged)
      git(source, ['add', path])
    }
    applied.push({
      file,
      path,
      keys: rows.length,
      removedOrphans: pruned.removed,
      sha256: createHash('sha256').update(overlayText).digest('hex')
    })
  }
  if (git(source, ['diff', '--cached', '--name-only'])) {
    git(source, ['commit', '-m', 'fork: apply Russian translations'], {
      GIT_AUTHOR_DATE: timestamp,
      GIT_COMMITTER_DATE: timestamp
    })
  }
  return applied
}
