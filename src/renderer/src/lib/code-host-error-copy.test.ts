import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import es from '@/i18n/locales/es.json'
import { codeHostFailure } from '../../../shared/code-host-failure-copy'
import { codeHostErrorText } from './code-host-error-copy'

const originalLanguage = i18n.language

afterEach(async () => {
  await i18n.changeLanguage(originalLanguage)
})

describe('codeHostErrorText', () => {
  it('localizes a coded failure and keeps the gh/glab detail verbatim', async () => {
    i18n.addResourceBundle('es', 'translation', es)
    await i18n.changeLanguage('es')
    const unresolved = codeHostFailure('github.repoUnresolved')
    expect(unresolved.error).toBe('Could not resolve GitHub owner/repo for this repository')
    expect(codeHostErrorText(unresolved)).toBe(es.codeHost.errors.github.repoUnresolved)

    const detail = 'HTTP 422: {{detail}} $& rejected'
    const failed = codeHostFailure('github.rerunFailed', detail)
    expect(failed.error).toBe(`Failed to rerun checks: ${detail}`)
    expect(codeHostErrorText(failed)).toBe(
      es.codeHost.errors.github.rerunFailed.replace('{{detail}}', () => detail)
    )
  })

  it('shows the host English for uncoded, unknown, or incomplete failures', async () => {
    i18n.addResourceBundle('es', 'translation', es)
    await i18n.changeLanguage('es')
    expect(codeHostErrorText({ error: 'Old host text' })).toBe('Old host text')
    expect(codeHostErrorText({ error: 'Newer host text', errorCode: 'github.future' })).toBe(
      'Newer host text'
    )
    expect(codeHostErrorText({ error: 'English', errorCode: 'github.rerunFailed' })).toBe('English')
    expect(codeHostErrorText({ error: 'English', errorCode: 'toString' })).toBe('English')
  })
})
