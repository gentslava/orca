import { join, relative } from 'node:path'
import type {
  ProviderRateLimits,
  RateLimitRuntimeTarget
} from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { NetworkProxySettings } from '../../../shared/network/network-proxy'
import { getAntigravityAccountService } from '../../antigravity/native-account-host'
import { fetchAntigravityRateLimits } from '../providers/antigravity/antigravity-usage-fetcher'
import { deriveMostConstrainedWindow } from '../rate-limit-bucket-summary'
import { localAccountRuntimeTargetKey } from '../../../shared/agent-accounts/local-account-runtime'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { hostShellEnvironment } from '../../runtime/agent-session/environment/structured-agent-shell-environment'

const MAX_ANTIGRAVITY_USAGE_AGE_MS = 30 * 60_000

type AntigravityUsageReceipt = {
  target: RateLimitRuntimeTarget
  login: string
  limits: ProviderRateLimits
}

async function antigravityUsageEnvironment(): Promise<NodeJS.ProcessEnv> {
  const env = await hostShellEnvironment()
  const accountHome = getAppEnvironment().getPath('home')
  const shellHome = env.HOME ?? env.USERPROFILE ?? accountHome
  const geminiHome = env.GEMINI_HOME ?? join(shellHome, '.gemini')
  if (relative(join(accountHome, '.gemini'), geminiHome) !== '') {
    throw new Error('The Antigravity CLI uses a different account directory on this host.')
  }
  return env
}

export class AntigravityCliQuota {
  private antigravityUsage: AntigravityUsageReceipt | null = null
  private expirationTimer: ReturnType<typeof setTimeout> | undefined
  private antigravityRead: {
    target: string
    controller: AbortController
    work: Promise<void>
  } | null = null
  constructor(
    private readonly readProxySettings: () => NetworkProxySettings | undefined,
    private readonly onChange: () => void
  ) {}

  refresh(target: RateLimitRuntimeTarget): Promise<void> {
    const targetKey = localAccountRuntimeTargetKey(target)
    if (this.antigravityRead?.target === targetKey) {
      return this.antigravityRead.work
    }
    this.antigravityRead?.controller.abort()
    const controller = new AbortController()
    const work = this.readAntigravityCli(target, controller.signal).finally(() => {
      if (this.antigravityRead?.controller === controller) {
        this.antigravityRead = null
      }
    })
    this.antigravityRead = { target: targetKey, controller, work }
    return work
  }

  private async readAntigravityCli(
    target: RateLimitRuntimeTarget,
    signal: AbortSignal
  ): Promise<void> {
    const accounts = await getAntigravityAccountService(target)
    const login = await accounts.readUsageLogin()
    if (signal.aborted) {
      return
    }
    if (!login) {
      throw new Error('Sign in to Antigravity on this host before refreshing its quota.')
    }
    const limits = await fetchAntigravityRateLimits({
      signal,
      target,
      ...(target.runtime === 'host' ? { resolveEnvironment: antigravityUsageEnvironment } : {}),
      networkProxySettings: this.readProxySettings()
    })
    if (signal.aborted) {
      return
    }
    if (login !== (await accounts.readUsageLogin())) {
      throw new Error('The Antigravity account changed during refresh. Refresh again.')
    }
    if (signal.aborted) {
      return
    }
    if (limits.status !== 'ok') {
      throw new Error(limits.error ?? 'Antigravity did not return quota.')
    }
    this.antigravityUsage = { target, login, limits }
    clearTimeout(this.expirationTimer)
    this.expirationTimer = setTimeout(
      () => {
        this.expirationTimer = undefined
        this.antigravityUsage = null
        this.onChange()
      },
      Math.max(0, limits.updatedAt + MAX_ANTIGRAVITY_USAGE_AGE_MS - Date.now())
    )
    this.onChange()
  }

  clear(): void {
    this.antigravityRead?.controller.abort()
    this.antigravityRead = null
    clearTimeout(this.expirationTimer)
    this.expirationTimer = undefined
    this.antigravityUsage = null
  }

  async getCurrent(): Promise<ProviderRateLimits | null> {
    const reading = this.antigravityUsage
    if (!reading || Date.now() - reading.limits.updatedAt >= MAX_ANTIGRAVITY_USAGE_AGE_MS) {
      return null
    }
    const account = await getAntigravityAccountService(reading.target)
    const login = await account.readUsageLogin().catch(() => null)
    if (reading !== this.antigravityUsage || login !== reading.login) {
      return null
    }
    const now = Date.now()
    const buckets = reading.limits.buckets?.filter(
      (bucket) => bucket.resetsAt === null || bucket.resetsAt > now
    )
    if (!buckets?.length) {
      return null
    }
    return {
      ...reading.limits,
      buckets,
      session: deriveMostConstrainedWindow(
        buckets.filter((bucket) => bucket.windowMinutes === 300)
      ),
      weekly: deriveMostConstrainedWindow(
        buckets.filter((bucket) => bucket.windowMinutes === 10_080)
      )
    }
  }
}
