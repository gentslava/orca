import { defineFixture } from '../../component-fixtures/component-fixture'
import { NativeChatToolLine } from './NativeChatToolLine'
import { nativeChatAppearanceStyle } from './native-chat-appearance-style'

function Invocations() {
  return (
    <div
      className="native-chat-appearance space-y-4 bg-chat-canvas p-4"
      style={nativeChatAppearanceStyle({})}
    >
      <NativeChatToolLine
        block={{
          type: 'tool-call',
          name: 'exec_command',
          state: 'completed',
          input: {
            cmd: "printf '%s\\n' 'Review completed'",
            workdir: '/workspace/orca',
            timeout_ms: 10000
          }
        }}
        result={{ type: 'tool-result', output: 'Review completed' }}
      />
      <NativeChatToolLine
        block={{
          type: 'tool-call',
          name: 'mcp__review_tools__SubagentHandoffWithCompleteReport',
          state: 'completed',
          input: {
            message: 'Specification review completed. All changed interfaces match the brief.',
            options: { recipients: ['parent'], final: true }
          }
        }}
        result={{ type: 'tool-result', output: '{"success":true,"message":"Report delivered"}' }}
      />
    </div>
  )
}

function expand(frame: HTMLElement) {
  for (const button of frame.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]')) {
    button.click()
  }
}

export const wide = defineFixture({ width: 780, render: Invocations, interact: expand })
export const narrow = defineFixture({ width: 360, render: Invocations, interact: expand })
