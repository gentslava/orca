import { defineFixture } from '../../component-fixtures/component-fixture'
import type { NativeChatBlock } from '../../../../shared/native-chat-types'
import { NativeChatToolRun } from './NativeChatToolRun'

const blocks = Array.from({ length: 16 }).flatMap((_, index): NativeChatBlock[] => [
  {
    type: 'tool-call',
    callId: `command-${index}`,
    name: 'shell',
    input: {
      command:
        index === 0
          ? 'cat AGENTS.md docs/missing.md'
          : `pnpm test src/renderer/src/components/native-chat/command-${index}.test.tsx --maxWorkers=2`
    },
    state: index < 3 ? 'failed' : 'completed'
  },
  {
    type: 'tool-result',
    callId: `command-${index}`,
    output:
      index === 0
        ? '# Useful commands\npnpm check:changed --maxWorkers=2\ncat: docs/missing.md: No such file or directory'
        : index < 3
          ? 'Test failed: expected a visible result.'
          : 'Tests passed.',
    isError: index < 3
  }
])

export const collapsedFailures = defineFixture({
  width: 480,
  render: () => (
    <div className="native-chat-appearance">
      <NativeChatToolRun blocks={blocks} expandSignal={false} activeTurnIsWorking />
    </div>
  )
})

export const expandedFailures = defineFixture({
  width: 480,
  render: () => (
    <div className="native-chat-appearance">
      <NativeChatToolRun blocks={blocks} expandSignal activeTurnIsWorking={false} />
    </div>
  ),
  interact: (frame) => {
    frame
      .querySelector<HTMLButtonElement>(
        '[data-native-chat-tool-run-members] button[aria-expanded="false"]'
      )
      ?.click()
  }
})
