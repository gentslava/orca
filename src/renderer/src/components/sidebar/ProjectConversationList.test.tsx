// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProjectConversationList } from './ProjectConversationList'
import {
  conversationListProps,
  conversationStore,
  conversationWorktrees,
  conversationSessions
} from './ProjectConversationList.test-fixture'
import {
  conversationPreferenceKey,
  type ConversationPreferences
} from '../../../../shared/conversation-navigation-preferences'
const state = vi.hoisted(() => ({
  preferences: { revision: 0, entries: {} } as ConversationPreferences,
  setPreference: vi.fn()
}))
vi.mock('./use-conversation-preferences', () => ({ useConversationPreferences: () => state }))
vi.mock('@/hooks/use-personal-project-order', () => ({
  usePersonalProjectOrderSupported: () => true
}))
vi.mock('./SidebarConversationStart', () => ({
  SidebarConversationStart: ({
    worktreeId,
    projectName
  }: {
    worktreeId: string
    projectName: string
  }) => <button data-workspace={worktreeId}>New chat in {projectName}</button>
}))
vi.mock('../right-sidebar/use-ai-vault-session-display-title', () => ({
  useAiVaultSessionDisplayTitle: (session: { title: string }) => session.title
}))
beforeEach(() => {
  state.preferences = { revision: 0, entries: {} }
  state.setPreference.mockReset().mockResolvedValue(undefined)
  useAppStore.setState(conversationStore)
})
afterEach(cleanup)
function mount(props = conversationListProps()) {
  return render(
    <TooltipProvider>
      <ProjectConversationList {...props} />
    </TooltipProvider>
  )
}
describe('Projects containing conversations', () => {
  it('shows five recent chats with project icons, then progressively reveals more', () => {
    mount()
    const project = screen.getByRole('region', { name: 'Orca' })
    expect(project.querySelectorAll('[data-conversation-id]')).toHaveLength(5)
    expect(within(project).getByText('🐋')).toBeTruthy()
    fireEvent.click(within(project).getByRole('button', { name: 'Show more' }))
    expect(project.querySelectorAll('[data-conversation-id]')).toHaveLength(7)
    expect(within(project).queryByRole('button', { name: 'Show more' })).toBeNull()
  })
  it('selects the focused chat while the legacy terminal selection is retained', () => {
    const workspaceId = conversationWorktrees[0]!.id
    const props = conversationListProps()
    props.groups = [
      {
        ...props.groups[0]!,
        sessions: [
          {
            ...conversationSessions[0]!,
            structuredSession: { sessionId: 'active-session', workspaceId }
          }
        ]
      }
    ]
    useAppStore.setState({
      activeWorktreeId: workspaceId,
      activeTabId: 'remembered-terminal',
      activeGroupIdByWorktree: { [workspaceId]: 'focused-group' },
      groupsByWorktree: {
        [workspaceId]: [
          {
            id: 'focused-group',
            worktreeId: workspaceId,
            activeTabId: 'chat-tab',
            tabOrder: ['chat-tab']
          }
        ]
      },
      unifiedTabsByWorktree: {
        [workspaceId]: [
          {
            id: 'chat-tab',
            entityId: 'active-session',
            groupId: 'focused-group',
            worktreeId: workspaceId,
            executionHostId: 'local',
            contentType: 'agent-session',
            label: 'Chat',
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 0
          }
        ]
      }
    })
    mount(props)
    expect(
      screen
        .getByRole('button', { name: conversationSessions[0]!.title })
        .getAttribute('aria-current')
    ).toBe('page')
  })
  it('creates a chat in its project even when another project is active', () => {
    mount()
    expect(screen.getByRole('button', { name: 'New chat in Orca' }).dataset.workspace).toBe(
      conversationWorktrees[0]!.id
    )
    expect(screen.getByRole('button', { name: 'New chat in Djinn' }).dataset.workspace).toBe(
      conversationWorktrees[1]!.id
    )
  })
  it('keeps archived chats reachable and writes pin/archive against the durable key', () => {
    state.preferences = {
      revision: 1,
      entries: { [conversationPreferenceKey(conversationSessions[0]!)]: { archived: true } }
    }
    mount()
    expect(screen.queryByText(conversationSessions[0]!.title)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    const chat = screen.getByText(conversationSessions[0]!.title).closest('[data-conversation-id]')!
    fireEvent.click(within(chat as HTMLElement).getByRole('button', { name: 'Restore chat' }))
    expect(state.setPreference).toHaveBeenCalledWith(
      conversationPreferenceKey(conversationSessions[0]!),
      { archived: false }
    )
  })
  it('does not truncate search matches and excludes only proven empty conversations', () => {
    const props = conversationListProps()
    props.query = 'history'
    props.groups = [
      {
        ...props.groups[0]!,
        sessions: [
          ...conversationSessions,
          {
            ...conversationSessions[0]!,
            id: 'empty',
            sessionId: 'empty',
            conversationContent: 'empty'
          }
        ]
      }
    ]
    const result = mount(props)
    expect(result.container.querySelectorAll('[data-conversation-id]')).toHaveLength(7)
  })
})
