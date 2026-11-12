import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { i18n, loadRendererUiLanguage } from '@/i18n/i18n'
import { buildTabCreateMenuOptions } from '../tab-bar/tab-create-menu-options'
import { WorkspaceStartActions } from './WorkspaceStartActions'

function Actions() {
  useUiLanguageRevision()
  return (
    <WorkspaceStartActions
      rows={[
        { kind: 'chat', agent: 'claude' },
        { kind: 'chat', agent: 'codex' }
      ]}
      loading={false}
      options={buildTabCreateMenuOptions({
        terminalOnly: false,
        hasNewBrowser: true,
        hasNewMarkdown: true,
        hasOpenMarkdown: true,
        hasSimulator: true,
        simulatorIsGoTo: false
      })}
      onLaunch={() => {}}
      onSelect={() => {}}
      onManageAgents={() => {}}
    />
  )
}
const render = () => <Actions />

export const desktop = defineFixture({
  width: 900,
  render,
  interact: async () => {
    await i18n.changeLanguage(await loadRendererUiLanguage('ru'))
  }
})
export const narrow = defineFixture({
  width: 360,
  render,
  interact: async () => {
    await i18n.changeLanguage(await loadRendererUiLanguage('ru'))
  }
})
