import { describe, expect, it } from 'vitest'
import { nativeChatToolCallInputView, nativeChatToolLineView } from './native-chat-tool-line-view'

describe('command disclosure', () => {
  it('opens a running short command before any output exists', () => {
    const view = nativeChatToolLineView({
      type: 'tool-call',
      name: 'Bash',
      state: 'running',
      input: { command: 'git status --short', description: 'Inspect changes' }
    })
    expect(view.hasDetail).toBe(true)
    expect(view.body).toBeUndefined()
    expect(view.label).toMatchObject({ fullCommand: 'git status --short', commandDetail: null })
  })

  it('keeps the full command accessible when metadata accompanies a shortened label', () => {
    const command = `pnpm test ${'src/checkout/payment-validation.test.ts '.repeat(4)}`
    const call = {
      type: 'tool-call' as const,
      name: 'Bash',
      state: 'running' as const,
      input: { command, description: 'Validate checkout', timeout: 600000 }
    }
    const view = nativeChatToolLineView(call)
    expect(view.hasDetail).toBe(true)
    expect(view.label?.target.length).toBeLessThan(command.trim().length)
    expect(view.label?.commandDetail).toBeNull()
    expect(nativeChatToolCallInputView(call, view.label)).toMatchObject({
      command: null,
      showsBody: true
    })
  })
})
