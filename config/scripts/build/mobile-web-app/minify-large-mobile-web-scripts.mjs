import { createRequire } from 'node:module'
import { basename } from 'node:path'
import { isScriptOutput } from './mobile-web-app-chunk-grouping.mjs'
import { PAGE_GLOBALS_BANNER } from './page-globals-banner.mjs'

const requireMobile = createRequire(new URL('../../../../mobile/package.json', import.meta.url))
const LARGE_SCRIPT_BYTES = 256 * 1024
const PAGE_GLOBALS_PREFIX = `${PAGE_GLOBALS_BANNER}\n`

export async function minifyLargeMobileWebScripts(
  outputFiles,
  catalogOutputs,
  minify = (source, options) => requireMobile('terser').minify(source, options)
) {
  const files = []
  for (const output of outputFiles) {
    if (
      !isScriptOutput(output.path) ||
      output.contents.byteLength < LARGE_SCRIPT_BYTES ||
      catalogOutputs.has(basename(output.path))
    ) {
      files.push(output)
      continue
    }
    const source = output.text
    const prefix = source.startsWith(PAGE_GLOBALS_PREFIX) ? PAGE_GLOBALS_PREFIX : ''
    const { code } = await minify(source.slice(prefix.length), {
      module: true,
      ecma: 2022,
      compress: { passes: 2 },
      mangle: true
    })
    const contents = Buffer.from(prefix + code)
    files.push(contents.byteLength < output.contents.byteLength ? { ...output, contents } : output)
  }
  return files
}
