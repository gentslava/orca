import type { StructuredAgentSessionOptionState } from './agent-session/options/structured-agent-session-options'
import type { SessionOptionValue } from './native-chat/input/native-chat-session-options'
import { STRUCTURED_LAUNCH_SEED_OPTION_IDS } from './native-chat/input/native-chat-session-option-defaults'
import { structuredAgentSessionRememberedPickModel } from './agent-session/options/structured-agent-session-remembered-pick-model'
import {
  decodeStructuredAgentSessionOptionValue,
  encodeStructuredAgentSessionOptionValue
} from './agent-session/options/structured-agent-session-option-codec'

export type StructuredSessionOptionPick = {
  modelId: string
  optionId: string
  value: SessionOptionValue
  adoptModelAsLaunchDefault?: boolean
}

/** Persist reconciled model-scoped values; Default stays inherited until an explicit model pick. */
export function structuredAgentSessionOptionPicks(
  state: StructuredAgentSessionOptionState,
  committed: Readonly<Record<string, string>>,
  existingChat = false
): StructuredSessionOptionPick[] {
  if (!state.catalog) {
    return []
  }
  const remembered = structuredAgentSessionRememberedPickModel(
    state,
    committed.model,
    existingChat || (state.modelDefault === true && committed.model === undefined)
  )
  if (!remembered) {
    return []
  }
  return STRUCTURED_LAUNCH_SEED_OPTION_IDS.flatMap((optionId) => {
    const value = committed[optionId]
    if (value === undefined) {
      return []
    }
    const decoded = decodeStructuredAgentSessionOptionValue(optionId, value)
    return decoded === null ||
      (typeof decoded === 'string' && !decoded.trim()) ||
      encodeStructuredAgentSessionOptionValue(optionId, decoded) === null
      ? []
      : [{ ...remembered, optionId, value: decoded }]
  })
}
