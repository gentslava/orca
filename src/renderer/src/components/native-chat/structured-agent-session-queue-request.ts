import type { StructuredAgentSessionHostCapabilityState } from '@/runtime/structured-agent-session-host-capability'

export type StructuredAgentSessionQueueDelivery = {
  capability: StructuredAgentSessionHostCapabilityState
  enabled: boolean
}

export function structuredAgentSessionRequestedDelivery(
  queue: StructuredAgentSessionQueueDelivery,
  isWorking: boolean,
  requested?: 'immediate' | 'queue-if-active'
): 'immediate' | 'queue-if-active' | undefined {
  return requested ?? (isWorking ? (queue.enabled ? 'queue-if-active' : 'immediate') : undefined)
}

export function structuredAgentSessionNewSendsQueue(
  queue: StructuredAgentSessionQueueDelivery
): boolean {
  return queue.capability === 'supported' && queue.enabled
}

export function structuredAgentSessionQueueRequest(
  queue: StructuredAgentSessionQueueDelivery
): 'queue-if-active' | undefined {
  return structuredAgentSessionNewSendsQueue(queue) ? 'queue-if-active' : undefined
}
