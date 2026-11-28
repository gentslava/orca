import { homedir } from 'node:os'
import { findHostProgram } from '../../../acp/launch/acp-launch-command'
import { ANTIGRAVITY_LAUNCH_SPEC } from '../../../antigravity/antigravity-acp-launch-spec'
import { agyCredentialPresence } from '../../../antigravity/agy-credential-presence'
import type { UsageRateLimitFailureKind } from '../../../../shared/agent-usage/rate-limits/rate-limit-types'

export type AntigravityHostProgramOptions = {
  env: NodeJS.ProcessEnv
  resolveCommand?: typeof findHostProgram
  credentialPresence?: typeof agyCredentialPresence
}

type AntigravityHostProgram =
  | { kind: 'found'; program: string }
  | { kind: 'missing' }
  | { kind: 'login-unreadable'; message: string; failureKind: UsageRateLimitFailureKind }

const LOGIN_UNREADABLE = {
  absent: {
    message: 'Antigravity usage is not available. Sign in to Antigravity, then refresh usage.',
    failureKind: 'missing-credentials'
  },
  locked: {
    message:
      'Antigravity usage is not available. The Antigravity sign-in could not be read without unlocking the system keyring. Unlock it or sign in to Antigravity, then refresh usage.',
    failureKind: 'keychain-unavailable'
  }
} as const

export async function resolveAntigravityHostProgram(
  command: string,
  options: AntigravityHostProgramOptions
): Promise<AntigravityHostProgram> {
  const env = Object.fromEntries(
    Object.entries(options.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  const homePath = env.HOME ?? env.USERPROFILE ?? homedir()
  const installDirectories = ANTIGRAVITY_LAUNCH_SPEC.installDirectories({ env, homePath })
  const program = await (options.resolveCommand ?? findHostProgram)(
    command,
    env,
    installDirectories
  )
  if (!program) {
    return { kind: 'missing' }
  }
  // Looking up a missing or locked login in agy could prompt during a background read.
  const presence = await (options.credentialPresence ?? agyCredentialPresence)(homePath)
  return presence === 'present'
    ? { kind: 'found', program }
    : { kind: 'login-unreadable', ...LOGIN_UNREADABLE[presence] }
}
