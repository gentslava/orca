import { lstat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { UsageAccountRoot } from '../../../usage/usage-account-attribution'
import { isDirectory } from '../claude-profile-homes'
// Keep the router setup graph out of scan workers.
import type { ClaudeProfileRouter } from './claude-profile-router'
import type { ClaudeWslProfileRouter } from '../wsl/claude-profile-wsl-router'
import type { ClaudeAccountSelectionTarget } from '../../selection/runtime-selection'
import type { ClaudeObservedConfigDirs } from './claude-observed-config-dirs'

export async function claudeAccountHistoryRoots(): Promise<UsageAccountRoot[]> {
  const router = installed
  const roots = await Promise.all(
    (router?.accountHomes() ?? []).map(async (path) => {
      const accountId = basename(dirname(path))
      try {
        if (router?.accountHome(accountId) !== path) {
          return null
        }
        const directories = await Promise.all(
          [path, dirname(path), dirname(dirname(path))].map((entry) => lstat(entry))
        )
        return directories.every((entry) => entry.isDirectory()) ? { path, accountId } : null
      } catch {
        return null
      }
    })
  )
  return router === installed ? roots.filter((root) => root !== null) : []
}

let installed: ClaudeProfileRouter | undefined

/** Installed only in the desktop process. */
export function installClaudeProfileRouter(router: ClaudeProfileRouter | undefined): void {
  installed = router
}

export function getClaudeProfileRouter(): ClaudeProfileRouter | undefined {
  return installed
}

let installedObserved: ClaudeObservedConfigDirs | undefined

export function installClaudeObservedConfigDirs(dirs: ClaudeObservedConfigDirs | undefined): void {
  installedObserved = dirs
}

export function getClaudeObservedConfigDirs(): ClaudeObservedConfigDirs | undefined {
  return installedObserved
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

/** The user's CLAUDE_CONFIG_DIR from the login shell, folders Orca saw Claude use, and account homes. */
export function claudeProfileHistoryDirs(surface: 'projects' | 'transcripts'): string[] {
  const homes = [
    installed?.userConfigDir(),
    ...(installedObserved?.list() ?? []),
    ...(installed?.accountHomes() ?? [])
  ].filter((home): home is string => Boolean(home))
  const dirs = homes.map((home) => join(home, surface)).filter(isDirectory)
  return dirs.filter((dir, index) => dirs.indexOf(dir) === index)
}
