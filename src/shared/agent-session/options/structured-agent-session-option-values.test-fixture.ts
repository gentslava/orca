import { structuredAgentSessionOptionView } from './structured-agent-session-option-view'
import { structuredAgentSessionOptionSnapshot } from './structured-agent-session-option-snapshot'

export function shownModelAndEffort(...args: Parameters<typeof structuredAgentSessionOptionView>) {
  const snapshot = structuredAgentSessionOptionSnapshot(structuredAgentSessionOptionView(...args))
  const value = (id: string) => {
    const kind = snapshot.find((descriptor) => descriptor.id === id)?.kind
    return kind?.type === 'select' ? kind.currentValue : undefined
  }
  return { model: value('model'), effort: value('effort') }
}
