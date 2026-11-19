import { expect, type Page } from '@stablyai/playwright-test'

function activeWorktreeHasTerminalTab(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    const worktreeId = state?.activeWorktreeId
    return Boolean(worktreeId && (state?.tabsByWorktree[worktreeId] ?? []).length > 0)
  })
}

// Explicit empty-workspace actions: a workspace without tabs shows its start page, whose New Terminal starts the shell.
export async function openWorkspaceStartTerminal(page: Page, timeoutMs = 30_000): Promise<void> {
  // Windows lists one `New Terminal: <shell>` action per detected shell.
  const newTerminal = page
    .getByRole('button', { name: /^New Terminal(?::|$)/ })
    .filter({ visible: true })
    .first()
  await expect
    .poll(
      async () => (await activeWorktreeHasTerminalTab(page)) || (await newTerminal.isVisible()),
      {
        timeout: timeoutMs,
        message: 'The active workspace showed neither a terminal tab nor its start page'
      }
    )
    .toBe(true)
  if (!(await activeWorktreeHasTerminalTab(page))) {
    await newTerminal.click({ timeout: timeoutMs })
  }
}
