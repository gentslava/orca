import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as esbuild from 'esbuild'
import { chromium } from 'playwright-core'
import pngjs from 'pngjs'
import {
  mobileWebAppBuildOptions,
  MOBILE_WEB_APP_ROOT_RESET,
  MOBILE_WEB_APP_NATIVE_PARITY_STYLE
} from '../build-mobile-web-app-bundle.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'
import { createBundleServer, readShellCsp } from './preview/mobile-web-app-render-harness.mjs'

const mobileDir = fileURLToPath(new URL('../../../mobile', import.meta.url))
const pixel = new pngjs.PNG({ width: 320, height: 240 })
for (let y = 0; y < 240; y++) {
  for (let x = 0; x < 320; x++) {
    const at = (y * 320 + x) * 4
    pixel.data.set(x < 160 ? [73, 126, 181, 255] : [225, 161, 89, 255], at)
  }
}
const content = pngjs.PNG.sync.write(pixel).toString('base64')
const path = '/host/agent-session-attachments/render/synthetic.png'
const entry = `
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { MobileNativeChatRowOverlaysHost } from './src/session/native-chat/transcript/MobileNativeChatRowOverlaysHost'
import { MobileNativeChatMessage } from './src/session/native-chat/transcript/MobileNativeChatMessage'
import { stubRpcClient } from './src/transport/rpc-client-test-stub'
import { RpcClientProvider } from './src/transport/client-context.web'
globalThis.__imageRequests = []
const client = stubRpcClient({ sendRequest: async (method, params) => {
  globalThis.__imageRequests.push({method, params})
  return {id:'image',ok:true,result:{content:${JSON.stringify(content)},isBinary:true,isImage:true,mimeType:'image/png'}}
}})
client.getShellSession = () => null
const message = {id:'picture',role:'user',source:'transcript',timestamp:null,blocks:[{type:'image-ref',path:${JSON.stringify(path)},alt:'Attached project sketch'},{type:'text',text:'Please review this sketch.'}]}
const metrics = {frame:{x:0,y:0,width:390,height:844},insets:{top:0,bottom:0,left:0,right:0}}
createRoot(document.getElementById('root')).render(h(RpcClientProvider,{client},h(SafeAreaProvider,{initialMetrics:metrics},
 h(MobileNativeChatRowOverlaysHost,{conversation:{surfaceId:'picture',sessionId:'session'},imageSource:{client,sessionId:'session'}},h(MobileNativeChatMessage,{message})))))
`
const describeRender = mobileWebAppDependenciesPresent() ? describe : describe.skip
let scratch, server, browser, origin
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'orca-mobile-chat-images-'))
  const outDir = join(scratch, 'bundle')
  await mkdir(outDir)
  await esbuild.build({
    ...mobileWebAppBuildOptions([]),
    write: true,
    entryPoints: undefined,
    stdin: { contents: entry, resolveDir: mobileDir, loader: 'js', sourcefile: 'chat-images.js' },
    splitting: false,
    outdir: outDir,
    entryNames: 'chat-images',
    metafile: false
  })
  await writeFile(
    join(outDir, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8">${MOBILE_WEB_APP_ROOT_RESET}${MOBILE_WEB_APP_NATIVE_PARITY_STYLE}</head><body><div id="root"></div><script type="module" src="/chat-images.js"></script></body></html>`
  )
  const served = await createBundleServer({ outDir, cspHeader: await readShellCsp() })
  server = served.server
  origin = served.origin
  const executablePath = process.env.ORCA_MOBILE_WEB_RENDER_BROWSER
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
}, 180_000)
afterAll(async () => {
  await browser?.close()
  server?.close()
  if (scratch) {
    await rm(scratch, { recursive: true, force: true })
  }
})

describeRender('mobile transcript attachments under shipped CSP', () => {
  it('decodes host bytes, opens the full-size viewer and returns to the message', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(origin)
    const image = page.getByRole('button', { name: 'Attached project sketch', exact: true })
    await image.waitFor({ timeout: 10_000 }).catch(async (error) => {
      throw new Error(
        JSON.stringify({
          errors,
          text: await page.locator('body').innerText(),
          html: (await page.locator('body').innerHTML()).slice(0, 3000),
          requests: await page.evaluate(() => globalThis.__imageRequests)
        }),
        { cause: error }
      )
    })
    await expect
      .poll(() =>
        page
          .locator('img')
          .evaluateAll((images) =>
            images.some((image) => image.complete && image.naturalWidth === 320)
          )
      )
      .toBe(true)
    expect(await page.locator('body').innerText()).toContain('Please review this sketch.')
    expect(await page.locator('body').innerText()).not.toContain(path)
    expect(await page.evaluate(() => globalThis.__imageRequests)).toEqual([
      { method: 'agentSessionAttachment.read', params: { path } }
    ])
    const proof = process.env.ORCA_MOBILE_CHAT_IMAGE_PROOF_DIR
    if (proof) {
      await mkdir(proof, { recursive: true })
      await page.screenshot({ path: join(proof, 'mobile-chat-image.png') })
    }
    await image.click()
    await page.getByRole('button', { name: 'Close image', exact: true }).waitFor()
    await page.evaluate(() =>
      Promise.allSettled(document.getAnimations().map((animation) => animation.finished))
    )
    await expect
      .poll(() =>
        page
          .locator('img')
          .evaluateAll(
            (images) =>
              images.filter((image) => image.complete && image.naturalWidth === 320).length
          )
      )
      .toBe(2)
    if (proof) {
      await page.screenshot({ path: join(proof, 'mobile-chat-image-full.png') })
    }
    await page.getByRole('button', { name: 'Close image', exact: true }).click()
    await expect
      .poll(() => page.getByRole('button', { name: 'Close image', exact: true }).count())
      .toBe(0)
    expect(errors).toEqual([])
    await page.close()
  }, 60_000)
})
