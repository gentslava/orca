import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { restoreOrcadHostAccountLaunchEnv } from './orcad-host-account-launch-env-store'

test('restores the latest pushed account when two saves overlap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-host-account-'))
  try {
    const restoreHostAccountLaunchEnv = vi.fn<OrcaRuntimeService['restoreHostAccountLaunchEnv']>()
    const runtime = { restoreHostAccountLaunchEnv }
    await restoreOrcadHostAccountLaunchEnv(runtime, root, () => false)
    const [saved, persist] = restoreHostAccountLaunchEnv.mock.calls[0]!
    expect(saved).toBeNull()
    const first = { wslDistro: 'Ubuntu', terminal: { CODEX_HOME: '/old' }, claude: {} }
    const latest = { wslDistro: 'Ubuntu', terminal: { CODEX_HOME: '/selected' }, claude: {} }
    await Promise.all([persist(first), persist(latest)])
    await restoreOrcadHostAccountLaunchEnv(runtime, root, () => false)
    expect(restoreHostAccountLaunchEnv.mock.calls[1]?.[0]).toEqual(latest)
    expect(await readdir(root)).toEqual(['host-account-launch-env.json'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
