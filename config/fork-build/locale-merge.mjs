import { isDeepStrictEqual } from 'node:util'

const missing = Symbol('missing translation')
export const composableLocalePaths = new Set([
  'src/renderer/src/i18n/locales/en.json',
  'src/renderer/src/i18n/locales/ru.json',
  'mobile/src/i18n/locales/en.json',
  'mobile/src/i18n/locales/ru.json'
])

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseCatalog(text) {
  const value = JSON.parse(text)
  const scopes = []
  for (const token of text.matchAll(/"(?:\\.|[^"\\])*"|[{}]/g)) {
    if (token[0] === '{') {
      scopes.push(new Set())
    } else if (token[0] === '}') {
      scopes.pop()
    } else if (
      text
        .slice(token.index + token[0].length)
        .trimStart()
        .startsWith(':')
    ) {
      const key = JSON.parse(token[0])
      if (scopes.at(-1)?.has(key)) {
        throw new Error(`Duplicate translation key: ${key}`)
      }
      scopes.at(-1)?.add(key)
    }
  }
  function validate(node) {
    if (typeof node === 'string') {
      return
    }
    if (!object(node)) {
      throw new Error('Translation catalogs require objects and string leaves')
    }
    Object.values(node).forEach(validate)
  }
  if (!object(value)) {
    throw new Error('Translation catalog must be an object')
  }
  validate(value)
  return value
}

export function mergeTranslationCatalogs(baseText, oursText, theirsText) {
  function merge(base, ours, theirs, path = []) {
    if (isDeepStrictEqual(ours, theirs)) {
      return ours
    }
    if (isDeepStrictEqual(ours, base)) {
      return theirs
    }
    if (isDeepStrictEqual(theirs, base)) {
      return ours
    }
    if (object(ours) && object(theirs) && (object(base) || base === missing)) {
      const keys = new Set([...Object.keys(theirs), ...Object.keys(ours)])
      const rows = []
      for (const key of keys) {
        const child = merge(
          object(base) && Object.hasOwn(base, key) ? base[key] : missing,
          Object.hasOwn(ours, key) ? ours[key] : missing,
          Object.hasOwn(theirs, key) ? theirs[key] : missing,
          [...path, key]
        )
        if (child !== missing) {
          rows.push([key, child])
        }
      }
      return Object.fromEntries(rows)
    }
    throw new Error(`Conflicting translation: ${path.join('.')}`)
  }
  return `${JSON.stringify(
    merge(parseCatalog(baseText), parseCatalog(oursText), parseCatalog(theirsText)),
    null,
    2
  )}\n`
}
