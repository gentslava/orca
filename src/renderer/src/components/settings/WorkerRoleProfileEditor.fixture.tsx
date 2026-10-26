import { useTranslation } from 'react-i18next'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { getDefaultSettings } from '../../../../shared/constants'
import { setRendererUiLanguage } from '@/i18n/i18n'
import { recordHostModelCatalogSnapshot } from '@/runtime/host-model-catalog-snapshots'
import { WorkerRoleProfileEditor } from './WorkerRoleProfileEditor'

function WorkerRoleFixture(): React.JSX.Element {
  useTranslation()
  return (
    <div className="rounded-md border border-border bg-card p-4 text-card-foreground">
      <WorkerRoleProfileEditor
        role="implementation"
        profile={{ agent: 'codex', model: 'gpt-6.1-sol', effort: 'high' }}
        detectedIds={['codex']}
        disabledAgents={[]}
        disabled={false}
        structuredFast
        onChange={() => {}}
      />
    </div>
  )
}

const setup = (): void =>
  recordHostModelCatalogSnapshot({ kind: 'local' }, 'codex', null, {
    origin: 'probe',
    fetchedAt: 1,
    fastModeSupport: { supported: true },
    models: [
      {
        id: 'gpt-6.1-sol',
        label: 'GPT 6.1 Sol',
        isDefault: false,
        efforts: [
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' }
        ],
        supportsFastMode: true
      },
      {
        id: 'gpt-6-astra',
        label: 'GPT 6 Astra',
        isDefault: false,
        efforts: [{ value: 'high', label: 'High' }],
        supportsFastMode: false
      }
    ]
  })
const fixture = (field: 'agent' | 'model') =>
  defineFixture({
    width: 480,
    store: { settings: { ...getDefaultSettings('/fixture'), uiLanguage: 'ru' } },
    setup,
    render: () => <WorkerRoleFixture />,
    interact: async () => {
      await setRendererUiLanguage('ru')
      document
        .getElementById(`worker-role-implementation-${field}`)
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    }
  })
export const agents = fixture('agent')
export const models = fixture('model')
