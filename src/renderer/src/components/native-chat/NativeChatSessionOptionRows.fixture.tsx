import { defineFixture } from '../../component-fixtures/component-fixture'
import { i18n } from '@/i18n/i18n'
import { useTranslation } from 'react-i18next'
import { NativeChatSessionOptionRows } from './NativeChatSessionOptionRows'

function EffortExample({ currentValue = 'xhigh' }: { currentValue?: string }): React.JSX.Element {
  useTranslation()
  return (
    <div className="native-chat-appearance rounded-md border border-border bg-popover p-1 text-popover-foreground">
      <NativeChatSessionOptionRows
        options={[
          {
            id: 'effort',
            label: 'Effort',
            category: 'thought_level',
            kind: {
              type: 'select',
              currentValue,
              choices: [
                { value: 'minimal', label: 'Minimal' },
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'xhigh', label: 'Extra high' },
                { value: 'max', label: 'Max' }
              ]
            },
            valueSource: 'reported',
            transport: 'agent-session',
            settable: true
          }
        ]}
        shownReason={null}
        pendingIds={new Set()}
        onSet={() => {}}
        onAction={() => {}}
      />
    </div>
  )
}

export const russianEffort = defineFixture({
  width: 320,
  render: () => <EffortExample />,
  interact: async () => {
    await i18n.changeLanguage('ru')
  }
})

export const extraHigh = defineFixture({
  width: 320,
  render: () => <EffortExample />,
  interact: async () => {
    await i18n.changeLanguage('en')
  }
})

export const high = defineFixture({
  width: 320,
  render: () => <EffortExample currentValue="high" />,
  interact: async () => {
    await i18n.changeLanguage('en')
  }
})
