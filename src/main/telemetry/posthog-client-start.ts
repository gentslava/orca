import type { PostHog } from 'posthog-node'

type CaptureMessage = Parameters<PostHog['capture']>[0]
/** Desktop passes a first-window scheduler; Electron stays out of this plain-Node module. */
export type StartScheduler = (start: () => void) => void

let writeKey: string | null = null
const heldCaptures: CaptureMessage[] = []

/** Hold captures until the scheduled start so the SDK stays off the startup path (#35752). */
export function deferStart(key: string, schedule: StartScheduler, start: () => void): void {
  writeKey = key
  schedule(start)
}

export function isStartDeferred(): boolean {
  return writeKey !== null
}

/** Keep the capture time so replayed events land when they happened. */
export function holdCapture(message: CaptureMessage): void {
  heldCaptures.push({ ...message, timestamp: new Date() })
}

export function hasHeldCaptures(): boolean {
  return heldCaptures.length > 0
}

/** Claim the deferred start once; returns the held captures to replay in order. */
export function takeStart(): { writeKey: string; held: CaptureMessage[] } | null {
  if (writeKey === null) {
    return null
  }
  const start = { writeKey, held: heldCaptures.splice(0) }
  resetStart()
  return start
}

export function resetStart(): void {
  writeKey = null
  heldCaptures.length = 0
}
