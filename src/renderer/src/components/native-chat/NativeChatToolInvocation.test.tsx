// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatToolLine } from './tools/lines/NativeChatToolLine'
import { NativeChatToolRun } from './tools/runs/NativeChatToolRun'

vi.mock('@/lib/syntax-highlighting/oniguruma', async () => ({
  loadOniguruma: (await import('@/lib/syntax-highlighting/oniguruma-test-harness'))
    .loadNodeOniguruma
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const LONG_COMMAND = `printf '%s' ${Array.from({ length: 12 }, (_, index) => `'argument-${index}'`).join(' ')} END_OF_COMMAND`

function occurrences(node: Element | null, part: string): number {
  return (node?.textContent ?? '').split(part).length - 1
}

function openedDetail(container: HTMLElement): Element | null {
  const row = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')
  if (!row) {
    throw new Error('The tool row is missing')
  }
  fireEvent.click(row)
  return container.querySelector('[data-native-chat-member-detail]')
}

describe('expanded tool input drawn once', () => {
  it('draws an edit that has a diff as the diff alone, under its exact tool name', () => {
    const { container } = render(
      <NativeChatToolLine
        block={{
          type: 'tool-call',
          name: 'Edit',
          state: 'running',
          input: {
            file_path: '/repo/src/total.ts',
            old_string: 'const total = before',
            new_string: 'const total = after'
          }
        }}
      />
    )
    const detail = openedDetail(container)
    const invocation = detail?.querySelector('[data-native-chat-tool-invocation]')
    expect(invocation?.textContent).toBe('Edit')
    expect(occurrences(detail, 'const total = after')).toBe(1)
    expect(screen.queryByRole('button', { name: 'Copy input' })).toBeNull()
  })

  it.each([
    { name: 'the row shortened', command: LONG_COMMAND },
    { name: 'the row shows whole', command: 'ls -la' }
  ])('draws a lone command $name once as a command, before any result', ({ command }) => {
    const { container } = render(
      <NativeChatToolLine
        block={{ type: 'tool-call', name: 'Bash', state: 'running', input: { command } }}
      />
    )
    const detail = openedDetail(container)
    expect(detail?.querySelector('[data-native-chat-tool-invocation]')?.textContent).toBe('Bash')
    const code = detail?.querySelectorAll('pre[data-native-chat-code-content]')
    expect(code).toHaveLength(1)
    expect(code?.[0]?.textContent).toBe(command)
    expect(occurrences(detail, command)).toBe(1)
    expect(screen.queryByRole('button', { name: 'Copy input' })).toBeNull()
  })

  it('draws a command with other arguments as one input body, without a separate command', () => {
    const input = { cmd: LONG_COMMAND, workdir: '/repo', timeout_ms: 10000 }
    const { container } = render(
      <NativeChatToolLine block={{ type: 'tool-call', name: 'exec_command', input }} />
    )
    const detail = openedDetail(container)
    const code = detail?.querySelectorAll('pre[data-native-chat-code-content]')
    expect(code).toHaveLength(1)
    expect(code?.[0]?.textContent).toBe(JSON.stringify(input, null, 2))
    expect(occurrences(detail, 'END_OF_COMMAND')).toBe(1)
    expect(screen.getByRole('button', { name: 'Copy input' })).toBeInTheDocument()
  })
})

describe('expanded tool invocation', () => {
  it('opens and closes the invocation of a completed command with no output', () => {
    const command = 'printf silent_0'
    const { container } = render(
      <NativeChatToolLine
        block={{ type: 'tool-call', name: 'Bash', state: 'completed', input: { command } }}
        result={{ type: 'tool-result', output: '' }}
      />
    )
    const toggle = screen.getByRole('button', { name: /printf silent_0$/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('[data-native-chat-tool-invocation]')).toHaveTextContent('Bash')
    expect(container.querySelector('pre[data-native-chat-code-content]')).toHaveTextContent(command)
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('exposes the exact tool and all input fields separately from its result', () => {
    const input = { cmd: "printf '%s' hello", workdir: '/repo', timeout_ms: 10000 }
    const { container } = render(
      <NativeChatToolLine
        block={{ type: 'tool-call', name: 'exec_command', input, state: 'completed' }}
        result={{ type: 'tool-result', output: 'hello' }}
      />
    )
    expect(container.querySelector('[data-native-chat-tool-invocation]')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    const detail = container.querySelector('[data-native-chat-tool-invocation]')
    expect(detail).toHaveTextContent('exec_command')
    expect(detail?.querySelector('pre')?.textContent).toBe(JSON.stringify(input, null, 2))
    expect(screen.getByText('hello', { selector: 'pre' })).toBeInTheDocument()
  })

  it('opens a running custom call before it produces output, preserving nested arguments', () => {
    const name = 'mcp__review_tools__SubagentHandoffWithCompleteReport'
    const input = {
      message: 'report\nwith details',
      options: { recipients: ['parent'], final: false }
    }
    const { container } = render(
      <NativeChatToolLine
        block={{ type: 'tool-call', name, input: JSON.stringify(input), state: 'running' }}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('[data-native-chat-tool-invocation]')).toHaveTextContent(name)
    expect(container.querySelector('[data-native-chat-tool-invocation]')).toHaveTextContent(
      'Review tools / SubagentHandoffWithCompleteReport'
    )
    expect(container.querySelector('pre')?.textContent).toBe(JSON.stringify(input, null, 2))
  })

  it('reveals a command shorter than the preview limit through the activity disclosure', () => {
    const command = "printf '%s' 'the-final-word-of-this-narrow-row-must-remain-inspectable'"
    expect(command.length).toBeLessThan(80)
    const { container } = render(
      <NativeChatToolRun
        blocks={[
          {
            type: 'tool-call',
            name: 'exec_command',
            input: { cmd: command, workdir: '/repo' },
            state: 'completed'
          },
          { type: 'tool-result', output: 'probe completed' }
        ]}
        expandSignal={false}
      />
    )
    const toggle = container.querySelector<HTMLButtonElement>('[data-native-chat-tool-run-state]')
    if (!toggle) {
      throw new Error('The activity disclosure is missing')
    }
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /exec_command/ }))
    const input = container.querySelector('[data-native-chat-tool-invocation] pre')
    expect(input?.textContent).toBe(JSON.stringify({ cmd: command, workdir: '/repo' }, null, 2))
    expect(screen.getByText('probe completed', { selector: 'pre' })).toBeInTheDocument()
  })

  it('retains explicit integration identity and explains missing legacy input', () => {
    render(
      <NativeChatToolLine
        block={{
          type: 'tool-call',
          name: 'shell',
          input: null,
          mcpIdentity: { server: 'review_tools', tool: 'execute' }
        }}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('review_tools / execute')).toBeInTheDocument()
    expect(screen.getByText('Input is not available in this transcript.')).toBeInTheDocument()
  })

  it('keeps large input bounded initially and reveals and copies the complete value on request', async () => {
    const input = { message: `${'a'.repeat(4500)}END_OF_INPUT` }
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('api', { ui: { writeClipboardText } })
    const { container } = render(
      <NativeChatToolLine block={{ type: 'tool-call', name: 'handoff', input }} />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('pre')).not.toBeNull()
    expect(container.querySelector('pre')?.textContent).not.toContain('END_OF_INPUT')
    fireEvent.click(screen.getByRole('button', { name: 'Show full input' }))
    expect(container.querySelector('pre')?.textContent).toBe(JSON.stringify(input, null, 2))
    fireEvent.click(screen.getByRole('button', { name: 'Copy input' }))
    expect(writeClipboardText).toHaveBeenCalledWith(JSON.stringify(input, null, 2))
  })
})
