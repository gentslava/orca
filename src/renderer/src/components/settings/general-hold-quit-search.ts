import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { isWebClientLocation } from '@/lib/web-client-location'

export function getHoldQuitEntries(
  options: { showHoldQuit?: boolean } = {}
): SettingsSearchEntry[] {
  if (
    !(options.showHoldQuit ?? (getRendererAppPlatform() === 'darwin' && !isWebClientLocation()))
  ) {
    return []
  }
  return [
    {
      title: translate('settings.appearance.holdQuit.title', 'Hold ⌘Q while agents are working'),
      description: translate(
        'settings.appearance.holdQuit.description',
        'Hold for about a second to quit during active work. When agents finish, a quick press quits normally.'
      ),
      keywords: [
        'Cmd+Q',
        'Cmd Q',
        'Command Q',
        '⌘Q',
        'close',
        'exit',
        'выход',
        'выйти',
        'закрытие',
        'закрыть',
        'удержание',
        'удерживать',
        ...translateSearchKeyword('settings.appearance.holdQuit.keyword.quit', 'quit'),
        ...translateSearchKeyword('auto.components.settings.voice.pane.search.064a9bd94a', 'hold'),
        ...translateSearchKeyword('auto.components.settings.general.search.baa263d6d8', 'agents')
      ]
    }
  ]
}
