import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { FilePlus, FileText, Globe, Settings, Smartphone, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentIcon } from '@/lib/agent-catalog'
import { useTranslate } from '@/i18n/use-translate'
import type { NewTabAgentMenuRow } from '../../../../shared/agent-launch/picker/agent-launch-picker-rows'
import type { TabCreateMenuOption } from '../tab-bar/tab-create-menu-options'
import { chatUnavailableLabel, rowId, rowLabel } from '../tab-bar/tab-agent-row-presentation'

function ActionIcon({ kind }: { kind: TabCreateMenuOption['kind'] }) {
  switch (kind) {
    case 'new-browser':
      return <Globe />
    case 'new-markdown':
    case 'new-plugin-file':
      return <FilePlus />
    case 'open-markdown':
      return <FileText />
    case 'new-simulator':
    case 'go-to-simulator':
      return <Smartphone />
    case 'new-terminal':
    case 'new-terminal-shell':
      return <TerminalSquare />
  }
}

export function WorkspaceStartActions({
  rows,
  loading,
  options,
  onLaunch,
  onSelect,
  onManageAgents
}: {
  rows: readonly NewTabAgentMenuRow[]
  loading: boolean
  options: readonly TabCreateMenuOption[]
  onLaunch: (row: NewTabAgentMenuRow) => void
  onSelect: (option: TabCreateMenuOption) => void
  onManageAgents: () => void
}) {
  const t = useTranslate()
  useUiLanguageRevision()
  return (
    <section className="@container mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {t('workspace.start.title', 'What would you like to open?')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('workspace.start.description', 'Choose an agent or a tool for this project.')}
        </p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">{t('workspace.start.agents', 'Agents')}</h2>
          <Button variant="ghost" size="sm" onClick={onManageAgents}>
            <Settings />
            {t('workspace.start.manageAgents', 'Manage agents')}
          </Button>
        </div>
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('auto.components.tab.bar.QuickLaunchButton.agentsLoading', 'Loading agents')}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('auto.components.tab.bar.QuickLaunchButton.e518f544b1', 'No agents detected')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
            {rows.map((row) => (
              <Button
                key={rowId(row)}
                variant="outline"
                size="lg"
                className="h-auto min-h-12 min-w-0 justify-start whitespace-normal text-left"
                disabled={row.kind === 'chat-unavailable'}
                onClick={() => onLaunch(row)}
              >
                <AgentIcon agent={row.agent} size={16} />
                <span className="min-w-0 break-words">
                  {rowLabel(row, t)}
                  {row.kind === 'chat-unavailable' ? (
                    <span className="block text-xs text-muted-foreground">
                      {chatUnavailableLabel(row.reason, t)}
                    </span>
                  ) : null}
                </span>
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">
        {options.map((option) => (
          <Button
            key={option.id}
            variant="ghost"
            size="lg"
            className="h-auto min-h-12 min-w-0 justify-start whitespace-normal text-left"
            onClick={() => onSelect(option)}
          >
            <ActionIcon kind={option.kind} />
            <span className="min-w-0 break-words">{option.label}</span>
          </Button>
        ))}
      </div>
    </section>
  )
}
