import { describe, expect, it } from 'vitest'
import { nativeChatToolCallInputView, nativeChatToolLineView } from './native-chat-tool-line-view'

describe('command disclosure', () => {
  it('opens a running short command before any output exists', () => {
    const view = nativeChatToolLineView({
      type: 'tool-call',
      name: 'Bash',
      state: 'running',
      input: { command: ' git status --short ' }
    })
    expect(view.hasDetail).toBe(true)
    expect(view.body).toBeUndefined()
    expect(view.label).toMatchObject({
      fullCommand: 'git status --short',
      commandDetail: ' git status --short '
    })
  })

  it('keeps the full command accessible when metadata accompanies a shortened label', () => {
    const command = `pnpm test ${'src/checkout/payment-validation.test.ts '.repeat(4)}`
    const view = nativeChatToolLineView({
      type: 'tool-call',
      name: 'Bash',
      state: 'running',
      input: { command, description: 'Validate checkout', timeout: 600000 }
    })
    expect(view.hasDetail).toBe(true)
    expect(view.label?.target.length).toBeLessThan(command.trim().length)
    expect(view.label?.fullCommand).toBe(command.trim())
    if (!view.call) {
      throw new Error('Expected a tool call')
    }
    expect(nativeChatToolCallInputView(view.call, view.label)).toMatchObject({
      command: null,
      showsBody: true
    })
    expect(view.call.input).toMatchObject({ command, timeout: 600000 })
  })
})
