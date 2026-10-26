import { defineFixture } from '../../component-fixtures/component-fixture'
import { ProjectConversationList } from './ProjectConversationList'
import { conversationListProps, conversationStore } from './ProjectConversationList.test-fixture'
import { getDefaultUIState } from '../../../../shared/constants'
import { refreshLocalRuntimeCapabilities } from '@/runtime/local-runtime-capabilities'
import { updateConversationPreference } from '../../../../shared/conversation-navigation-preferences'

function fixture(width = 320) {
  return defineFixture({
    width,
    store: conversationStore,
    setup: () => {
      let preferences = { revision: 0, entries: {} }
      window.api.runtime.getStatus = async () => ({
        runtimeId: 'fixture',
        rendererGraphEpoch: 0,
        graphStatus: 'ready',
        authoritativeWindowId: null,
        liveTabCount: 0,
        liveLeafCount: 0,
        runtimeProtocolVersion: 3,
        minCompatibleRuntimeClientVersion: 2,
        capabilities: ['ui.personalProjectOrder.v1', 'ui.conversationPreferences.v1']
      })
      window.api.runtime.call = async (request) => {
        let result: unknown = {
          ui: { ...getDefaultUIState(), conversationPreferences: preferences }
        }
        if (request.method === 'ui.setConversationPreference') {
          const parsed = (
            await import('../../../../shared/conversation-navigation-preferences')
          ).SetConversationPreferenceParams.parse(request.params)
          preferences = updateConversationPreference(preferences, parsed)
          result = { preferences }
        }
        return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
      }
      void refreshLocalRuntimeCapabilities()
    },
    render: () => (
      <div className="flex h-128 flex-col bg-sidebar text-sidebar-foreground">
        <h2 className="px-3 pt-3 pb-1 text-sm font-medium">Projects</h2>
        <ProjectConversationList {...conversationListProps()} />
      </div>
    )
  })
}
export const compactProjects = fixture()
export const narrowProjects = fixture(260)
