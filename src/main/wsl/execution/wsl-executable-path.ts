import { existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { win32 as pathWin32 } from 'node:path'

/** Prefer checked System32 wsl.exe to avoid PATH hijacking (#15749); use PATH only when that file is absent. */
let cached: string | undefined

function systemWslExecutablePath(): string {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  return pathWin32.join(systemRoot, 'System32', 'wsl.exe')
}

export function resolveWslExecutablePath(): string {
  if (cached !== undefined) {
    return cached
  }
  const absolute = systemWslExecutablePath()
  // A host with WSL elsewhere still deserves a working call.
  cached = existsSync(absolute) ? absolute : 'wsl.exe'
  return cached
}

export async function resolveWslExecutablePathAsync(): Promise<string> {
  if (cached !== undefined) {
    return cached
  }
  const absolute = systemWslExecutablePath()
  const resolved = await access(absolute).then(
    () => absolute,
    () => 'wsl.exe'
  )
  cached ??= resolved
  return cached
}
