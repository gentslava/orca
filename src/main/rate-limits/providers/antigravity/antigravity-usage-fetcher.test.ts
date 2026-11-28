import { expect, it } from 'vitest'
import { join } from 'node:path'
import type { runProcess } from '@orca/process-host'
import { fetchAntigravityRateLimits } from './antigravity-usage-fetcher'
function recordingRun(spawned: string[]): typeof runProcess {
  return async (spec) => {
    spawned.push(spec.program)
    const stdout = spec.args?.[0] === '--version' ? '1.5.15\n' : '{}'
    return { code: 0, signal: null, stdout, stderr: '', timedOut: false }
  }
}

const hostProbe = {
  resolveEnvironment: async () => ({ PATH: '/usr/bin', HOME: '/home/me' }),
  credentialPresence: async () => 'present' as const,
  now: () => 0
}

it('hands the Settings proxy to the host agy usage probe', async () => {
  const spawnedEnvs: (NodeJS.ProcessEnv | undefined)[] = []
  const runCommand: typeof runProcess = async (spec) => {
    spawnedEnvs.push(spec.env)
    const stdout = spec.args?.[0] === '--version' ? '1.5.15\n' : '{}'
    return { code: 0, signal: null, stdout, stderr: '', timedOut: false }
  }
  await fetchAntigravityRateLimits({
    ...hostProbe,
    runCommand,
    resolveCommand: async () => '/usr/local/bin/agy',
    resolveEnvironment: async () => ({ PATH: '/usr/bin', NO_PROXY: 'corp.internal' }),
    now: () => 0,
    networkProxySettings: {
      httpProxyUrl: 'http://proxy.example:3128',
      httpProxyBypassRules: 'localhost'
    }
  })
  const usageEnv = spawnedEnvs.at(-1)
  expect(usageEnv?.HTTPS_PROXY).toBe('http://proxy.example:3128')
  expect(usageEnv?.NO_PROXY).toBe('corp.internal,localhost')
  expect(usageEnv?.AGY_CLI_DISABLE_AUTO_UPDATE).toBe('true')
})

it('looks where the Antigravity installer places agy when the login shell PATH omits it', async () => {
  const spawned: string[] = []
  const localBin = join('/home/me', '.local', 'bin')
  const program = join(localBin, 'agy')
  await fetchAntigravityRateLimits({
    ...hostProbe,
    runCommand: recordingRun(spawned),
    resolveCommand: async (command, env, directories) => {
      expect(command).toBe('agy')
      expect(env.PATH).toBe('/usr/bin')
      expect(directories).toContain(localBin)
      return program
    }
  })
  expect(spawned).toEqual([program, program])
})

it.each([
  ['absent', 'missing-credentials'],
  ['locked', 'keychain-unavailable']
] as const)('does not launch agy when the host login is %s', async (presence, failureKind) => {
  const spawned: string[] = []
  const limits = await fetchAntigravityRateLimits({
    ...hostProbe,
    credentialPresence: async () => presence,
    runCommand: recordingRun(spawned),
    resolveCommand: async () => '/usr/local/bin/agy'
  })
  expect(spawned).toEqual([])
  expect(limits.usageMetadata?.failureKind).toBe(failureKind)
})

it('reports a missing CLI without a probe', async () => {
  const spawned: string[] = []
  const missing = await fetchAntigravityRateLimits({
    ...hostProbe,
    runCommand: recordingRun(spawned),
    resolveCommand: async () => null
  })
  expect(spawned).toEqual([])
  expect(missing.usageMetadata?.failureKind).toBe('cli-unavailable')
})
