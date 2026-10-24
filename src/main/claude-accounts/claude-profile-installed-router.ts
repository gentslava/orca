import { lstatSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { UsageAccountRoot } from '../usage/usage-account-attribution'
// Keep the router setup graph out of scan workers.
import type { ClaudeProfileRouter } from './claude-profile-router'
import type { ClaudeWslProfileRouter } from './claude-profile-wsl-router'
import type { ClaudeAccountSelectionTarget } from './runtime-selection'

/** Exclude linked history directories to avoid reading them twice. */
export function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory()
  } catch {
    return false
  }
}

export function listClaudeProfileHomes(dataRoot: string): string[] {
  const root = join(dataRoot, 'claude-profiles')
  let ids: string[]
  try {
    ids = readdirSync(root)
  } catch {
    return []
  }
  return ids.map((id) => join(root, id, 'home')).filter(isDirectory)
}

export function claudeAccountHistoryRoots(): UsageAccountRoot[] {
  const router = installed
  return (router?.accountHomes() ?? []).flatMap((path) => {
    const accountId = basename(dirname(path))
    try {
      return router?.accountHome(accountId) === path &&
        isDirectory(path) &&
        isDirectory(dirname(path)) &&
        isDirectory(dirname(dirname(path)))
        ? [{ path, accountId }]
        : []
    } catch {
      return []
    }
  })
}

let installed: ClaudeProfileRouter | undefined

/** Installed only in the desktop process. */
export function installClaudeProfileRouter(router: ClaudeProfileRouter | undefined): void {
  installed = router
}

export function getClaudeProfileRouter(): ClaudeProfileRouter | undefined {
  return installed
}

let installedWsl: ClaudeWslProfileRouter | undefined

export function installClaudeWslProfileRouter(router: ClaudeWslProfileRouter | undefined): void {
  installedWsl = router
}

export function getClaudeWslProfileRouter(): ClaudeWslProfileRouter | undefined {
  return installedWsl
}

export function withClaudeProfileTerminalEnv<Env extends Record<string, string> | undefined>(
  env: Env,
  target: ClaudeAccountSelectionTarget
): Env | Record<string, string> {
  const profileEnv = installed?.terminalEnv(target)
  return profileEnv ? { ...env, ...profileEnv } : env
}

/** Include account history only where setup could not link it into System default. */
export function claudeProfileHistoryDirs(surface: 'projects' | 'transcripts'): string[] {
  return (installed?.accountHomes() ?? []).map((home) => join(home, surface)).filter(isDirectory)
}
