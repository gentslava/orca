import { defineFixture } from '../../component-fixtures/component-fixture'
import { setRendererUiLanguage } from '@/i18n/i18n'
import { useTranslation } from 'react-i18next'
import { getDefaultSettings } from '../../../../shared/constants'
import { NativeChatSessionOptionRows } from './NativeChatSessionOptionRows'

function RussianEffort(): React.JSX.Element {
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
              currentValue: 'xhigh',
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
  store: { settings: { ...getDefaultSettings('/fixture'), uiLanguage: 'ru' } },
  render: () => <RussianEffort />,
  interact: async () => {
    await setRendererUiLanguage('ru')
  }
})
