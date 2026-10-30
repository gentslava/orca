import { defineFixture } from '../../component-fixtures/component-fixture'
import { NativeChatContextUsageRing } from './NativeChatContextUsageRing'
import { NativeChatQuestionCard } from './NativeChatQuestionCard'
import { NativeChatStructuredAsyncQuestion } from './NativeChatStructuredAsyncQuestion'
import { nativeChatAppearanceStyle } from './native-chat-appearance-style'

function QuestionControls({ invertedAccent = false }: { invertedAccent?: boolean }) {
  return (
    <div
      className="native-chat-appearance bg-chat-canvas p-4"
      style={{
        ...nativeChatAppearanceStyle({}),
        ...(invertedAccent
          ? { '--accent': 'var(--foreground)', '--accent-foreground': 'var(--background)' }
          : {})
      }}
    >
      <NativeChatContextUsageRing
        usage={{
          usedTokens: 42_000,
          windowTokens: 200_000,
          percentage: 21,
          estimated: false,
          rows: []
        }}
      />
      <NativeChatQuestionCard
        prompt={{
          questions: [
            {
              question: 'Where should this run?',
              multiSelect: true,
              options: [
                { label: 'Local', description: 'Use this computer.' },
                { label: 'Remote', description: 'Use the connected host.' }
              ]
            }
          ]
        }}
        onAnswer={() => {}}
        onCancel={() => {}}
      />
    </div>
  )
}

export const standard = defineFixture({ width: 560, render: () => <QuestionControls /> })

export const invertedAccent = defineFixture({
  width: 560,
  render: () => <QuestionControls invertedAccent />,
  interact: (frame) => frame.querySelector<HTMLButtonElement>('button[aria-pressed]')?.click()
})

export const asyncAfterAgentNotice = defineFixture({
  width: 560,
  render: () => (
    <div
      className="native-chat-appearance min-h-64 bg-chat-canvas p-4"
      style={nativeChatAppearanceStyle({})}
    >
      <NativeChatStructuredAsyncQuestion
        paneKey="fixture:async-after-agent-notice"
        session={{
          readPhase: 'ready',
          messages: [
            {
              id: 'question',
              role: 'assistant',
              blocks: [
                {
                  type: 'tool-call',
                  name: 'request_user_input_async',
                  callId: 'fixture-question',
                  input: {
                    questions: [
                      {
                        title: 'Which devices received the latest update?',
                        options: ['Desktop only', 'Desktop and Android']
                      }
                    ]
                  }
                }
              ],
              timestamp: 1,
              source: 'transcript'
            },
            {
              id: 'notice',
              role: 'user',
              blocks: [{ type: 'text', text: 'You have 1 orchestration message.' }],
              from: { kind: 'agent', senders: [], orchestration: null },
              timestamp: 2,
              source: 'transcript'
            }
          ]
        }}
        send={() => true}
      />
    </div>
  )
})
