// Persist desktop-pushed account environment so launches before reconnect keep the selected account.
import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  HostAccountLaunchEnvParams,
  type HostAccountLaunchEnv
} from '../../../shared/agent-launch/startup/host-account-launch-env'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { isWslHostOrcadProcessAsync } from '../../wsl/filesystem/wsl-guest-windows-drive-path'
import { createWslHostClaudeProfileRefresh } from './orcad-wsl-host-claude-profile-refresh'

const FILE_NAME = 'host-account-launch-env.json'

async function readOrcadHostAccountLaunchEnv(
  userDataPath: string
): Promise<HostAccountLaunchEnv | null> {
  let raw: string
  try {
    raw = await readFile(join(userDataPath, FILE_NAME), 'utf8')
  } catch {
    return null
  }
  try {
    const parsed = HostAccountLaunchEnvParams.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function writeOrcadHostAccountLaunchEnv(
  userDataPath: string,
  launchEnv: HostAccountLaunchEnv
): Promise<void> {
  const target = join(userDataPath, FILE_NAME)
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(launchEnv), { mode: 0o600 })
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function restoreOrcadHostAccountLaunchEnv(
  runtime: Pick<OrcaRuntimeService, 'restoreHostAccountLaunchEnv'>,
  userDataPath: string,
  isWslHost: () => boolean | Promise<boolean> = isWslHostOrcadProcessAsync
): Promise<void> {
  // Why only a WSL host: only there does a desktop push accounts into account folders in this distro.
  const wslHost = await isWslHost()
  let writes = Promise.resolve()
  runtime.restoreHostAccountLaunchEnv(
    await readOrcadHostAccountLaunchEnv(userDataPath),
    (launchEnv) => {
      const write = writes.then(() => writeOrcadHostAccountLaunchEnv(userDataPath, launchEnv))
      writes = write.catch(() => {})
      return write
    },
    wslHost
      ? { expectDesktopPush: true, refreshClaudeProfile: createWslHostClaudeProfileRefresh() }
      : {}
  )
}
