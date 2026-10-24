import { _electron as electron, expect } from '@stablyai/playwright-test'
import { build as buildMain } from 'esbuild'
import { build as buildRenderer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mkdirSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createElectronHomeIsolation } from '../../e2e/helpers/electron-home-isolation.ts'

expect(process.env.ORCA_BACKGROUND_LAUNCH).toBe('1')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const parent = path.join(root, '.bench-fixtures')
mkdirSync(parent, { recursive: true })
const output = mkdtempSync(path.join(parent, 'conversation-first-'))
const main = path.join(output, 'main.cjs')
await buildMain({
  entryPoints: [path.join(root, 'tests/tools/benchmarks/spinner-rendering/main.ts')],
  outfile: main,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron']
})
await buildRenderer({
  configFile: false,
  root: import.meta.dirname,
  base: './',
  logLevel: 'silent',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(root, 'src/renderer/src') } },
  build: { outDir: path.join(output, 'renderer'), emptyOutDir: true }
})
const { ELECTRON_RUN_AS_NODE: _node, ...inheritedEnv } = process.env
const isolation = createElectronHomeIsolation({
  inheritedEnv,
  launchEnv: {},
  extraEnv: {},
  userDataDir: path.join(output, 'profile')
})
const app = await electron.launch({
  args: [main, '--password-store=basic', '--use-mock-keychain'],
  env: isolation.env
})
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(pathToFileURL(path.join(output, 'renderer/index.html')).href)
  await expect(page.getByText('I am checking the implementation', { exact: false })).toBeVisible()
  const tools = page.getByRole('button', { name: /Ran 2 commands/ })
  await expect(tools).toHaveAttribute('aria-expanded', 'false')
  expect((await tools.boundingBox()).height).toBeLessThanOrEqual(40)
  await tools.click()
  await expect(tools).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('git status --short', { exact: true })).toBeVisible()
  await tools.click()
  const composer = page.getByRole('textbox', {
    name: 'Ask anything, @ to mention files, / for commands',
    exact: true
  })
  await composer.fill('First follow-up')
  await composer.press('Enter')
  const queue = page.getByRole('list', { name: 'Queued messages', exact: true })
  await expect(queue.getByText('First follow-up', { exact: true })).toBeVisible()
  await composer.fill('Second follow-up')
  await composer.press('Enter')
  await queue.getByRole('button', { name: 'More actions', exact: true }).nth(1).press('ArrowDown')
  await page.getByRole('menuitem', { name: 'Move earlier', exact: true }).click()
  await expect(queue.getByRole('listitem').first()).toHaveAttribute(
    'data-queued-message-id',
    'fixture-draft-2'
  )
  await queue.getByRole('button', { name: 'More actions', exact: true }).first().press('ArrowDown')
  await page.getByRole('menuitem', { name: 'Edit message', exact: true }).click()
  await page.getByRole('textbox', { name: 'Edit message', exact: true }).fill('Edited follow-up')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(queue.getByText('Edited follow-up', { exact: true })).toBeVisible()
  await composer.fill('Immediate correction')
  await composer.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
  await expect(page.locator('[data-immediate-message]')).toHaveText(
    'Sent now: Immediate correction'
  )
  await expect(queue.getByRole('listitem')).toHaveCount(2)
  await queue.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await expect(queue.getByRole('listitem')).toHaveCount(1)
  await composer.fill('Return to this draft.')
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'queue-dark.png') })
  await page.getByRole('button', { name: /Ran 1 subagent/ }).click()
  await page.getByRole('button', { name: 'Research completed', exact: true }).click()
  await expect(page.locator('[data-native-chat-child-transcript="research"]')).toBeVisible()
  await expect(page.getByText('The child found the queue capability mismatch.')).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'child-dark.png') })
  await expect(composer).not.toBeVisible()
  await expect(
    page.getByText('I am checking the implementation', { exact: false })
  ).not.toBeVisible()
  await page.getByRole('button', { name: /Ran 1 subagent/ }).click()
  await page.getByRole('button', { name: /Review/ }).click()
  await expect(page.getByText('The independent review confirmed the finding.')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output, 'nested-child-dark.png')
  })
  await page.getByRole('button', { name: 'Research', exact: true }).click()
  await expect(page.locator('[data-native-chat-child-transcript="research"]')).toBeVisible()
  await page.getByRole('button', { name: 'Back to conversation', exact: true }).click()
  await expect(page.getByText('The investigation is complete.', { exact: false })).toBeVisible()
  await expect(composer).toHaveText('Return to this draft.')
  await expect(page.getByRole('button', { name: 'Queue', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Draft actions', exact: true })).toHaveCount(0)
  await expect(page.getByText('Enter queues text and images.', { exact: true })).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'dark.png') })
  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await page.setViewportSize({ width: 420, height: 780 })
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'light-narrow.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.goto(`${pathToFileURL(path.join(output, 'renderer/index.html')).href}?enter=send`)
  await composer.fill('Immediate Enter')
  await composer.press('Enter')
  await expect(page.locator('[data-immediate-message]')).toHaveText('Sent now: Immediate Enter')
  await expect(queue).toHaveCount(0)
  await composer.fill('Queued by alternate shortcut')
  await composer.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
  await expect(queue.getByText('Queued by alternate shortcut', { exact: true })).toBeVisible()
  await expect(page.locator('[data-immediate-message]')).toHaveText('Sent now: Immediate Enter')
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output, 'inverse-shortcuts.png')
  })
  await page.getByRole('button', { name: /^Next turn: Model Research/ }).click()
  await page.getByRole('option', { name: 'Review model', exact: true }).click()
  await page.getByRole('switch', { name: 'Fast mode', exact: true }).click()
  await page.getByRole('radio', { name: 'Low', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Next turn: Model Review/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /^Next turn: Model Review/ })).toContainText('Low')
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  const russianComposer = page.getByRole('textbox', {
    name: 'Задайте вопрос; @ — файлы, / — команды',
    exact: true
  })
  await expect(russianComposer).toBeVisible()
  await expect(page.getByRole('button', { name: /^Next turn:/ })).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Очередь сообщений', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy message', exact: true })).toHaveCount(0)
  await russianComposer.fill('Черновик остаётся в основном чате.')
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'russian-composer.png') })
  await page.setViewportSize({ width: 320, height: 780 })
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'russian-narrow.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(`${pathToFileURL(path.join(output, 'renderer/index.html')).href}?view=settings`)
  const quotas = page.getByTestId('usage-account-quotas')
  await expect(quotas.getByTestId('usage-quota-codex')).toHaveCount(2)
  await expect(quotas).toContainText('example@fixture.test (Work)')
  await expect(quotas).toContainText('example@fixture.test (Personal)')
  await expect(page.getByTestId('usage-history-totals')).toContainText('252')
  const quotaText = await quotas.innerText()
  const history = page.getByTestId('usage-overview-pane')
  await page.getByRole('radio', { name: '7 days', exact: true }).click()
  await expect(page.getByTestId('usage-history-totals')).toContainText('33.6')
  await page.getByRole('combobox', { name: 'Project', exact: true }).click()
  await page.getByRole('option', { name: 'Orca', exact: true }).click()
  await expect(page.getByTestId('usage-history-totals')).toContainText('19.2')
  expect(await quotas.innerText()).toBe(quotaText)
  await history.getByRole('combobox', { name: 'Account', exact: true }).click()
  await page.getByRole('option', { name: /Codex.*Recorded account work/ }).click()
  await expect(page.getByTestId('usage-history-totals')).toContainText('9.6')
  await expect(page.getByTestId('usage-history-daily').getByRole('button')).toHaveCount(2)
  expect(await quotas.innerText()).toBe(quotaText)
  await history.getByRole('combobox', { name: 'Account', exact: true }).click()
  await page.getByRole('option', { name: 'Unknown account', exact: true }).click()
  await expect(page.getByTestId('usage-history-totals')).toContainText('14.4')
  await expect(page.getByTestId('usage-history-daily').getByRole('button')).toHaveCount(3)
  await history.getByRole('combobox', { name: 'Account', exact: true }).click()
  await page.getByRole('option', { name: 'All accounts', exact: true }).click()
  await expect(page.getByTestId('usage-history-totals')).toContainText('33.6')
  await page.getByRole('combobox', { name: 'Project', exact: true }).click()
  await page.getByRole('option', { name: 'Orca', exact: true }).click()
  await page.locator('main').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output, 'usage-dark.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'История использования', exact: true })
  ).toBeVisible()
  await expect(page.getByTestId('usage-history-totals')).toContainText('19,2')
  await page
    .getByTestId('usage-history-daily')
    .getByRole('radio', { name: 'Расчёт по API', exact: true })
    .click()
  await expect(
    page.getByTestId('usage-history-daily').getByRole('button').first()
  ).toHaveAccessibleName(/оценка по тарифам API/)
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
  await page.locator('main').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output, 'usage-russian-light.png'),
    fullPage: true
  })
  await page.getByTestId('usage-history-daily').scrollIntoViewIfNeeded()
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output, 'usage-russian-history.png'),
    fullPage: true
  })
  await page.setViewportSize({ width: 390, height: 840 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output, 'usage-russian-narrow.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: 'Roles fixture', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Роли агентов', exact: true })).toBeVisible()
  await expect(page.getByText('Исследование', { exact: true })).toBeVisible()
  await page.locator('#worker-role-research-model').click()
  await page.getByRole('option', { name: 'Opus', exact: true }).click()
  await expect(page.locator('#worker-role-research-effort')).toBeEnabled()
  await page.locator('#worker-role-research-effort').click()
  await page.getByRole('option', { name: 'Высокий', exact: true }).click()
  await page.locator('#worker-role-research-fast').click()
  await page.getByRole('option', { name: /^Включ/ }).click()
  await expect(page.locator('#worker-role-research-fast')).toContainText('Включ')
  await page.locator('#worker-role-research-agent').click()
  await page.getByRole('option', { name: 'Codex', exact: true }).click()
  await expect(page.locator('#worker-role-research-model')).toHaveText('Как у агента')
  await expect(page.locator('#worker-role-research-effort')).toBeDisabled()
  await page.getByLabel('Добавить роль', { exact: true }).fill('documentation')
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(page.getByText('documentation', { exact: true })).toBeVisible()
  await page.locator('main').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output, 'roles-russian-narrow.png'),
    fullPage: true
  })
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.screenshot({
    animations: 'disabled',
    path: path.join(output, 'roles-russian-light.png'),
    fullPage: true
  })
  await page.goto(`${pathToFileURL(path.join(output, 'renderer/index.html')).href}?view=workers`)
  const parentComposer = page.getByRole('textbox')
  await parentComposer.fill('Keep this parent draft while inspecting a separate worker.')
  const workerRoster = page.locator('[data-native-chat-session-children="true"]')
  await workerRoster.getByRole('button').first().click()
  await page.getByRole('button', { name: /Cross-provider worker/ }).click()
  const workerFeed = page.locator('[data-native-chat-child-transcript="dispatch:worker-attempt"]')
  await expect(workerFeed.getByText('Review the queue behavior.', { exact: true })).toBeVisible()
  await expect(
    workerFeed.getByText('The separate worker verified both Enter behaviors.')
  ).toBeVisible()
  await expect(parentComposer).not.toBeVisible()
  await page.getByRole('button', { name: 'Русский', exact: true }).click()
  await page.screenshot({ animations: 'disabled', path: path.join(output, 'separate-worker.png') })
  await workerFeed.locator('button[class*="group/subagent-run"]').click()
  await page.getByRole('button', { name: /Nested worker agent/ }).click()
  await expect(
    page.getByText('The nested worker transcript is independently inspectable.')
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cross-provider worker', exact: true }).click()
  await page.getByRole('button', { name: /^(Recorded result|Сохранённый результат)$/ }).click()
  await expect(page.getByText('Recorded completion remains available after release.')).toBeVisible()
  await page.getByRole('button', { name: /^(Back to conversation|К основному чату)$/ }).click()
  await expect(parentComposer).toHaveText(
    'Keep this parent draft while inspecting a separate worker.'
  )
  expect(
    await page.evaluate(() =>
      window.fixtureWorkerCalls.every((method) =>
        [
          'orchestration.sessionChildren',
          'agentSession.history',
          'agentSession.subscribe',
          'unsubscribe'
        ].includes(method)
      )
    )
  ).toBe(true)
  expect(errors).toEqual([])
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => [window.isVisible(), window.isFocused()])
    )
  ).toEqual([[false, false]])
  console.log(
    `PASS: compact activity, reciprocal queue shortcuts, queue controls, parent draft, nested child history, live Russian locale, quota cards, history filters and role settings; light/dark and narrow layouts (${output})`
  )
} catch (error) {
  const page = app.windows()[0]
  if (page) {
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'failure.png') })
    console.error((await page.locator('body').innerText()).slice(0, 4000))
  }
  throw error
} finally {
  await app.close()
}
