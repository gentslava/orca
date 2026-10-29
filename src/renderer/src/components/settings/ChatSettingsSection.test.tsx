// @vitest-environment happy-dom
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { decodeAgentSessionAgentsResult } from '../../../../shared/agent-session/agent-session-registered-agents'
import { ChatSettingsSection } from './ChatSettingsSection'
import { NativeChatProvidersSetting } from './NativeChatProvidersSetting'
import { TooltipProvider } from '../ui/tooltip'
import { ActiveSettingsSectionProvider } from './SettingsSection'
import { getChatAppearanceSearchEntries } from './chat-appearance-search'
import { getChatNamingSearchEntry } from './chat-naming-search'
import { getChatInlineVisualsSearchEntry } from './chat-inline-visuals-search'
import { getChatBehaviorSearchEntries } from './chat-behavior-search'
import { AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/local-runtime-capabilities'
import { useStructuredAgentSessionHostQueuesMessages } from '@/runtime/structured-agent-session-host-capability'
import { getSettingsSectionSearchEntries, matchesSettingsSearch } from './settings-search'
import type * as HostStructuredAgentsModule from '@/runtime/host-structured-agents'
import { i18n } from '@/i18n/i18n'
import { buildSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'
import { buildCmdJSettingsResults } from '../cmd-j/palette-results'
import { isSettingsNavigationTarget } from '@/lib/settings-navigation-types'
import { getSettingsSectionId, getSettingsScrollTarget } from './settings-navigation-foundations'

const state = vi.hoisted(
  (): {
    settingsSearchQuery: string
    settings: GlobalSettings | null
    localDetectedAgentIdsByContext: Record<string, TuiAgent[] | null>
  } => ({ settingsSearchQuery: '', settings: null, localDetectedAgentIdsByContext: {} })
)
vi.mock('@/runtime/host-structured-agents', async (importOriginal) => ({
  ...(await importOriginal<typeof HostStructuredAgentsModule>()),
  readHostStructuredAgents: () =>
    decodeAgentSessionAgentsResult({ agents: [{ agent: 'grok', capabilities: {} }] }) ?? []
}))
vi.mock('@/lib/host-chat-program-acquisition', () => ({ useChatProgramFacts: () => {} }))
vi.mock('../../store', () => ({
  useAppStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
    getState: () => state
  })
}))

afterEach(async () => {
  cleanup()
  setLocalRuntimeCapabilitiesForTests(null)
  await i18n.changeLanguage('en')
})
beforeEach(() => {
  state.settingsSearchQuery = ''
  state.settings = null
  state.localDetectedAgentIdsByContext = {}
  setLocalRuntimeCapabilitiesForTests([AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY])
})

function renderChat(
  enabled: boolean | undefined,
  showDesktopOnlySettings = true,
  hasUnsavedChatPromptChanges = false,
  overrides: Partial<GlobalSettings> = {}
) {
  const settings = { ...getDefaultSettings('/tmp'), experimentalNativeChat: enabled, ...overrides }
  state.settings = settings
  const updateSettings = vi.fn(async (updates: Partial<GlobalSettings>) => {
    if (state.settings) {
      state.settings = { ...state.settings, ...updates }
    }
  })
  const element = (active = 'chat') => (
    <ActiveSettingsSectionProvider value={active}>
      <ChatSettingsSection
        settings={settings}
        updateSettings={updateSettings}
        writeSourceControlAiSettings={async () => {}}
        searchEntries={[
          ...getChatAppearanceSearchEntries(),
          ...getChatBehaviorSearchEntries(),
          ...(showDesktopOnlySettings
            ? [getChatNamingSearchEntry(), getChatInlineVisualsSearchEntry()]
            : [])
        ]}
        showDesktopOnlySettings={showDesktopOnlySettings}
        isMounted
        hasUnsavedChatPromptChanges={hasUnsavedChatPromptChanges}
      />
    </ActiveSettingsSectionProvider>
  )
  return { ...render(element(), { wrapper: TooltipProvider }), element, updateSettings }
}

describe('Chat settings page', () => {
  it('preserves clicked provider choices while queued saves and inventory changes settle', async () => {
    let latest = getDefaultSettings('/tmp')
    state.settings = latest
    state.localDetectedAgentIdsByContext = { host: [] }
    let finish: () => void = () => {}
    const delayed = new Promise<void>((resolve) => {
      finish = resolve
    })
    const updateSettings = vi.fn(async (updates: Partial<GlobalSettings>) => {
      await delayed
      latest = { ...latest, ...updates }
      state.settings = latest
    })
    const element = () => (
      <NativeChatProvidersSetting settings={latest} updateSettings={updateSettings} />
    )
    const { rerender } = render(element())
    const claude = screen.getByRole('switch', { name: 'Open Claude as a chat' })
    const grok = screen.getByRole('switch', { name: 'Open Grok as a chat' })
    expect(grok.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(claude)
    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1))
    fireEvent.click(grok)
    fireEvent.click(claude)
    state.localDetectedAgentIdsByContext = { host: ['grok'] }
    rerender(element())
    expect(grok.getAttribute('aria-checked')).toBe('true')
    finish()
    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(3))
    expect(latest.nativeChatProviders).toEqual({ claude: false, grok: true })
  })

  it.each([false, true])(
    'keeps queue search and palette targets aligned with local support %s',
    (supported) => {
      setLocalRuntimeCapabilitiesForTests(
        supported ? [AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY] : []
      )
      const { result } = renderHook(() =>
        useStructuredAgentSessionHostQueuesMessages({ kind: 'local' })
      )
      const hostQueuesMessages = result.current
      const sections = buildSettingsNavigationMetadata({
        isMac: true,
        isWindows: false,
        isWebClient: false,
        nativeChatEnabled: true,
        hostQueuesMessages,
        repos: []
      })
      const chat = sections.find((section) => section.id === 'chat')
      const queueEntry = chat?.searchEntries.find(
        (entry) => entry.targetSectionId === 'chat-queue-follow-ups'
      )
      const queueResult = buildCmdJSettingsResults(sections).find(
        (entry) => entry.targetSectionId === 'chat-queue-follow-ups'
      )
      state.settingsSearchQuery = 'queue'
      const { container } = renderChat(true)
      expect(chat && matchesSettingsSearch('queue', getSettingsSectionSearchEntries(chat))).toBe(
        true
      )
      expect(Boolean(queueEntry)).toBe(true)
      expect(Boolean(queueResult)).toBe(true)
      expect(Boolean(container.querySelector('#chat-queue-follow-ups'))).toBe(true)
      expect(Boolean(container.querySelector('#chat-behavior'))).toBe(true)
      expect(queueResult?.sectionId).toBe('chat')
      expect(getSettingsScrollTarget(queueResult?.targetSectionId ?? '', container)).toBe(
        container.querySelector('#chat-queue-follow-ups')
      )
      expect(
        screen.getByRole('switch', { name: 'Toggle queue follow-ups' }).hasAttribute('disabled')
      ).toBe(!supported)
    }
  )

  it('retains the unsaved naming draft when search no longer matches Chat', () => {
    const { element, rerender, container } = renderChat(true, true, true)
    const naming = container.querySelector('#chat-names')
    if (!naming) {
      throw new Error('Chat naming section is missing')
    }
    const advanced = naming.querySelector('button[aria-expanded]')
    if (!advanced) {
      throw new Error('Advanced control is missing')
    }
    fireEvent.click(advanced)
    const template = screen.getByText('Command template').nextElementSibling
    if (!(template instanceof HTMLTextAreaElement)) {
      throw new Error('Command template textarea is missing')
    }
    fireEvent.change(template, { target: { value: 'Unsaved: {firstPrompt}' } })
    state.settingsSearchQuery = 'unrelated setting'
    rerender(element())
    expect(screen.getByDisplayValue('Unsaved: {firstPrompt}')).toBe(template)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(container.querySelector('#chat-names')).toBeTruthy()
    expect(container.querySelector('#chat-appearance')).toBeNull()
  })

  it('searches a moved row and resolves its deep link within the Chat page', () => {
    state.settingsSearchQuery = 'Code text size'
    const { container, element, rerender } = renderChat(true)
    expect(screen.queryByRole('spinbutton', { name: 'Text size' })).toBeNull()
    expect(screen.getByRole('spinbutton', { name: 'Code text size' })).toBeTruthy()
    const sections = buildSettingsNavigationMetadata({
      isMac: true,
      isWindows: false,
      isWebClient: false,
      nativeChatEnabled: true,
      repos: []
    })
    const result = buildCmdJSettingsResults(sections).find(
      (entry) => entry.sectionId === 'chat' && entry.title === 'Code text size'
    )
    expect(result?.targetSectionId).toBe('chat-code-text-size')
    const target = { pane: 'chat', repoId: null, sectionId: result?.targetSectionId } as const
    expect(isSettingsNavigationTarget(target)).toBe(true)
    expect(getSettingsSectionId(target.pane, target.repoId, new Map())).toBe('chat')
    expect(getSettingsScrollTarget(target.sectionId ?? '', container)?.querySelector('input')).toBe(
      screen.getByRole('spinbutton', { name: 'Code text size' })
    )
    rerender(element('appearance'))
    expect(container.querySelector('#chat')).toBeNull()
    state.settingsSearchQuery = ''
    rerender(element())
    for (const entry of getChatAppearanceSearchEntries().filter((entry) => entry.targetSectionId)) {
      expect(getSettingsScrollTarget(entry.targetSectionId ?? '', container)).toBeTruthy()
    }
  })
})
