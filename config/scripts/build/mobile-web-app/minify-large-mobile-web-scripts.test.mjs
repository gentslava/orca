import { expect, it } from 'vitest'
import { minifyLargeMobileWebScripts } from './minify-large-mobile-web-scripts.mjs'
import { PAGE_GLOBALS_BANNER, bannerOnlyWhereScriptsRunFirst } from './page-globals-banner.mjs'

it('preserves the page bootstrap until script ordering is validated', async () => {
  const text = `${PAGE_GLOBALS_BANNER}\n/* ${'x'.repeat(262144)} */\nexport const value = 1;`
  const source = { path: '/fixture/app.js', text, contents: Buffer.from(text) }
  const [script] = await minifyLargeMobileWebScripts([source], new Set())
  expect(script.contents.length).toBeLessThan(source.contents.length)
  expect(script.contents.toString()).toMatch(/^globalThis\.process/)
  const [importingScript] = bannerOnlyWhereScriptsRunFirst(
    { outputs: { '/fixture/app.js': { imports: [{ kind: 'import-statement' }] } } },
    [script]
  )
  expect(importingScript.contents.toString()).toBe('export const value=1;')
})
