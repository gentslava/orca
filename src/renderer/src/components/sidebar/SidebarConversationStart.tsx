import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useAgentMenuObservation } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import { AgentIcon, getAgentCatalog } from '@/lib/agent-catalog'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { captureNativeChatComposerFocusIntent } from '@/components/native-chat/use-native-chat-composer-reveal-focus'
import type { NewTabAgentMenuRow } from '@/lib/new-tab-agent-menu-rows'

export function SidebarConversationStart(): React.JSX.Element {
  useTranslation()
  const worktreeId = useAppStore((state) => state.activeWorktreeId)
  const openModal = useAppStore((state) => state.openModal)
  const [open, setOpen] = useState(false)
  const target = useAgentDetectionTargetForWorktree(worktreeId)
  const { model } = useAgentMenuObservation(worktreeId, open, target)
  const rows = model.state === 'settled' ? model.rows.filter((row) => row.kind === 'chat') : []
  const selected = rows[0]
  const label = translate('components.tab-bar.newChat', 'New chat')
  const chooseLabel = translate(
    'dashboard.sidebar.chooseChatAgent',
    'Choose an agent for a new chat'
  )
  const launch = (row: NewTabAgentMenuRow): void => {
    if (!worktreeId || row.kind !== 'chat') {
      return
    }
    launchAgentInNewTab({
      requestId: newAgentLaunchRequestId(),
      focusIntent: captureNativeChatComposerFocusIntent(),
      agent: row.agent,
      worktreeId,
      requestedSurface: 'chat',
      selectedExecutionHostId: row.executionHostId
    })
  }
  return (
    <div className="flex shrink-0 items-center gap-1 px-3 pb-2">
      <Button
        variant="outline"
        size="sm"
        className="min-w-0 flex-1 justify-start"
        onClick={() => {
          if (!worktreeId) {
            openModal('add-repo')
          } else if (selected) {
            launch(selected)
          } else {
            setOpen(true)
          }
        }}
      >
        <MessageSquarePlus aria-hidden="true" />
        {worktreeId ? label : translate('dashboard.sidebar.openProject', 'Open project')}
      </Button>
      {worktreeId ? (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={chooseLabel}>
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{chooseLabel}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start">
            {rows.map((row) => (
              <DropdownMenuItem key={row.agent} onSelect={() => launch(row)}>
                <AgentIcon agent={row.agent} size={16} />
                {getAgentCatalog().find((agent) => agent.id === row.agent)?.label ?? row.agent}
              </DropdownMenuItem>
            ))}
            {rows.length === 0 ? (
              <DropdownMenuItem disabled>
                {model.state === 'loading'
                  ? translate('dashboard.sidebar.loadingChatAgents', 'Loading chat agents…')
                  : translate(
                      'dashboard.sidebar.noChatAgents',
                      'No chat agents available on this host'
                    )}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
