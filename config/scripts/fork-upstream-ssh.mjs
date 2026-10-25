import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function withForkSyncSsh(env, run) {
  if (!env.FORK_SYNC_DEPLOY_KEY?.trim()) {
    throw new Error(
      'FORK_SYNC_DEPLOY_KEY is required: provision a writable deploy key only for gentslava/orca'
    )
  }
  const directory = mkdtempSync(join(env.RUNNER_TEMP || tmpdir(), 'orca-fork-sync-ssh-'))
  try {
    chmodSync(directory, 0o700)
    const key = join(directory, 'identity')
    const knownHosts = join(directory, 'known_hosts')
    writeFileSync(key, `${env.FORK_SYNC_DEPLOY_KEY.trim()}\n`, { mode: 0o600, flag: 'wx' })
    writeFileSync(
      knownHosts,
      readFileSync(new URL('../fork-upstream-github-known-hosts', import.meta.url)),
      { mode: 0o600, flag: 'wx' }
    )
    const gitEnv = Object.fromEntries(
      Object.entries(env).filter(
        ([name]) =>
          !name.startsWith('GIT_') &&
          ![
            'FORK_SYNC_DEPLOY_KEY',
            'GITHUB_TOKEN',
            'GH_TOKEN',
            'SSH_AUTH_SOCK',
            'SSH_AGENT_PID',
            'SSH_ASKPASS'
          ].includes(name)
      )
    )
    const nullFile = process.platform === 'win32' ? 'NUL' : '/dev/null'
    // Git invokes GIT_SSH_COMMAND through its POSIX shell, including Git for Windows.
    const ssh = [
      'ssh',
      '-F',
      nullFile,
      '-i',
      key,
      '-o',
      'IdentitiesOnly=yes',
      '-o',
      'IdentityAgent=none',
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      `UserKnownHostsFile=${JSON.stringify(knownHosts)}`,
      '-o',
      `GlobalKnownHostsFile=${nullFile}`,
      '-o',
      'UpdateHostKeys=no',
      '-o',
      'PasswordAuthentication=no',
      '-o',
      'KbdInteractiveAuthentication=no'
    ]
      .map((argument) => `'${argument.replaceAll("'", "'\\''")}'`)
      .join(' ')
    return await run({
      ...gitEnv,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: nullFile,
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_VARIANT: 'ssh',
      GIT_SSH_COMMAND: ssh
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
