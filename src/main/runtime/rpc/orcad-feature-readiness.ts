/**
 * Startup phases an orcad host finishes after its first RPC could arrive. A method that needs one
 * declares it (`requires`); the dispatcher waits a bounded time, then refuses retryably. Hosts that
 * never install a readiness (the desktop) have every feature open.
 */
export type OrcadFeature = 'accounts' | 'sessionSearch' | 'orchestration' | 'unshownPlacement'

export const ORCAD_FEATURES: readonly OrcadFeature[] = [
  'accounts',
  'sessionSearch',
  'orchestration',
  'unshownPlacement'
]

// Long enough to ride out a cold start; short enough that a caller's own retry takes over.
export const ORCAD_FEATURE_WAIT_MS = 10_000

export class OrcadFeatureReadiness {
  private readonly pending = new Map<OrcadFeature, { opened: Promise<void>; open: () => void }>()

  constructor(closed: readonly OrcadFeature[] = []) {
    for (const feature of closed) {
      let open!: () => void
      const opened = new Promise<void>((resolve) => {
        open = resolve
      })
      this.pending.set(feature, { opened, open })
    }
  }

  isOpen(feature: OrcadFeature): boolean {
    return !this.pending.has(feature)
  }

  open(feature: OrcadFeature): void {
    this.pending.get(feature)?.open()
    this.pending.delete(feature)
  }

  /** True once every feature is open; false if any is still closed after `timeoutMs`. */
  async waitFor(features: readonly OrcadFeature[], timeoutMs: number): Promise<boolean> {
    const waits = features.flatMap((feature) => this.pending.get(feature)?.opened ?? [])
    if (waits.length === 0) {
      return true
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    try {
      return await Promise.race([Promise.all(waits).then(() => true), timedOut])
    } finally {
      clearTimeout(timer)
    }
  }
}

// One runtime per orcad process; the desktop's never installs one, so all features read open.
let current = new OrcadFeatureReadiness()

export function orcadFeatureReadiness(): OrcadFeatureReadiness {
  return current
}

/** orcad startup: every feature starts closed and opens where its phase finishes. */
export function installOrcadFeatureReadiness(): OrcadFeatureReadiness {
  current = new OrcadFeatureReadiness(ORCAD_FEATURES)
  return current
}

export function _resetOrcadFeatureReadinessForTests(): void {
  current = new OrcadFeatureReadiness()
}

/**
 * The wait for a method's required features, or null when nothing is closed, so ungated dispatch
 * keeps its synchronous start. Refuses with the existing retryable `runtime_unavailable`.
 */
export function rpcMethodFeatureWait(
  requires: readonly OrcadFeature[] | undefined,
  timeoutMs = ORCAD_FEATURE_WAIT_MS
): Promise<void> | null {
  if (!requires?.some((feature) => !current.isOpen(feature))) {
    return null
  }
  return current.waitFor(requires, timeoutMs).then((ready) => {
    if (!ready) {
      throw new Error('runtime_unavailable')
    }
  })
}

/** Declares `feature` on each method of a family, e.g. every `orchestration.*` method. */
export function requiringOrcadFeature<M extends { readonly requires?: readonly OrcadFeature[] }>(
  feature: OrcadFeature,
  methods: readonly M[]
): M[] {
  return methods.map((method) => ({
    ...method,
    requires: [...(method.requires ?? []), feature]
  }))
}
