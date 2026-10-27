import { describe, expect, it } from 'vitest'
import {
  nativeChatModelPillLabel,
  sayNativeChatSessionOptionEnglish as say
} from './native-chat-session-option-labels'
import type { SessionOptionDescriptor } from './native-chat/input/native-chat-session-options'

function modelDescriptor(
  valueSource: SessionOptionDescriptor['valueSource'],
  currentValue?: string
): SessionOptionDescriptor {
  return {
    id: 'model',
    label: 'Model',
    valueSource,
    transport: 'catalog',
    settable: true,
    kind: {
      type: 'select',
      ...(currentValue ? { currentValue } : {}),
      choices: [{ value: 'grok-4.5', label: 'Grok 4.5' }]
    }
  }
}

describe('nativeChatModelPillLabel', () => {
  it('withholds a value it has no evidence for', () => {
    expect(nativeChatModelPillLabel(modelDescriptor('unknown', 'grok-4.5'), say)).toBe('Model')
    expect(nativeChatModelPillLabel(modelDescriptor('default'), say)).toBe('Model')
  })

  it('falls back to the raw id when the list no longer offers it', () => {
    // Keep naming a tracked model after discovery drops it; the running selection is still known.
    expect(nativeChatModelPillLabel(modelDescriptor('reported', 'grok-build'), say)).toBe(
      'grok-build'
    )
  })
})
