import { Suspense } from 'react'
import { lazyWithRetry } from '@/app-shell/startup/lazy-with-retry'
import { SidebarProjectsListSlot } from './SidebarBotsSplit'

const ConversationHistory = lazyWithRetry(
  () => import('../right-sidebar/ai-vault/panel/AiVaultPanel')
)

export function SidebarConversationsList({
  botsShown,
  collapsed,
  onOpen
}: {
  botsShown: boolean
  collapsed: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <SidebarProjectsListSlot botsShown={botsShown} collapsed={collapsed}>
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ConversationHistory conversationNavigation onSessionOpened={onOpen} />
      </Suspense>
    </SidebarProjectsListSlot>
  )
}
