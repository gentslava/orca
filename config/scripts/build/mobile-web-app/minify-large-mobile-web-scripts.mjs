import { createRequire } from 'node:module'
import { basename } from 'node:path'
import { isScriptOutput } from './mobile-web-app-chunk-grouping.mjs'

const requireMobile = createRequire(new URL('../../../../mobile/package.json', import.meta.url))
const LARGE_SCRIPT_BYTES = 256 * 1024

export async function minifyLargeMobileWebScripts(outputFiles, catalogOutputs) {
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
    const { minify } = requireMobile('terser')
    const { code } = await minify(output.text, {
      module: true,
      ecma: 2022,
      compress: { passes: 2 },
      mangle: true
    })
    const contents = Buffer.from(code)
    files.push(contents.byteLength < output.contents.byteLength ? { ...output, contents } : output)
  }
  return files
}
