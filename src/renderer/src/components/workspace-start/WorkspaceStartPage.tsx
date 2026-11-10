import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { useAppStore } from '@/store'
import { useTabBarRuntimeModel } from '../tab-bar/use-tab-bar-runtime-model'
import { useTabBarCreateMenuController } from '../tab-bar/use-tab-bar-create-menu-controller'
import { usePluginNewFileMenuOptions } from '../tab-bar/use-plugin-new-file-menu-options'
import { WorkspaceStartActions } from './WorkspaceStartActions'

export function WorkspaceStartPage({
  worktreeId,
  groupId,
  onNewTerminalTab,
  onNewTerminalWithShell,
  onNewBrowserTab,
  onNewSimulatorTab,
  onNewFileTab
}: {
  worktreeId: string
  groupId?: string
  onNewTerminalTab: () => void
  onNewTerminalWithShell: (shell: string) => void
  onNewBrowserTab: () => void
  onNewSimulatorTab?: () => void
  onNewFileTab?: () => void
}) {
  useUiLanguageRevision()
  const runtime = useTabBarRuntimeModel({ worktreeId, groupId })
  const menu = useTabBarCreateMenuController({
    ...runtime,
    worktreeId,
    terminalOnly: false,
    onNewTerminalTab,
    onNewTerminalWithShell,
    onNewBrowserTab,
    onNewSimulatorTab,
    onNewFileTab
  })
  const plugins = usePluginNewFileMenuOptions(
    menu.createMenuOptions,
    menu.handleSelectCreateMenuOption,
    runtime.resolvedGroupId
  )
  return (
    <div className="absolute inset-0 overflow-y-auto bg-background text-foreground scrollbar-sleek">
      <WorkspaceStartActions
        rows={menu.agentMenu.state === 'settled' ? menu.agentMenu.rows : []}
        loading={menu.agentMenu.state === 'loading'}
        options={plugins.menuOptions}
        onLaunch={(row) => {
          void menu.launchAgentRow(row)
          menu.runPendingNewTabMenuFocusAfterClose()
        }}
        onSelect={(option) => {
          plugins.onSelectMenuOption(option)
          menu.runPendingNewTabMenuFocusAfterClose()
        }}
        onManageAgents={() => {
          const state = useAppStore.getState()
          state.openSettingsTarget({ pane: 'agents', repoId: null })
          state.openSettingsPage()
        }}
      />
    </div>
  )
}
