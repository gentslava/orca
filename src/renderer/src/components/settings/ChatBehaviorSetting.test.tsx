import { AGENT_LAUNCH_PERMISSION_CHOICE_CAPABILITY } from '../../../../shared/agent-launch-runtime-capability'
import { getChatPermissionSearchEntry } from './chat-permission-search'
// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY } from '../../../../shared/protocol-version'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/local-runtime-capabilities'
import { ChatBehaviorSetting } from './ChatBehaviorSetting'
import { TooltipProvider } from '../ui/tooltip'

afterEach(() => {
  cleanup()
  setLocalRuntimeCapabilitiesForTests(null)
  vi.unstubAllGlobals()
})

const SHELL_ENV_TOGGLE = '[aria-label="Toggle using your shell environment"]'
const NAME_INPUT = '#settings-native-chat-shell-environment-name'

function renderSetting(overrides: Partial<GlobalSettings>, updateSettings = vi.fn()) {
  return render(
    <ChatBehaviorSetting
      settings={{ ...getDefaultSettings('/tmp'), ...overrides }}
      updateSettings={updateSettings}
    />,
    { wrapper: TooltipProvider }
  )
}

function nameInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(NAME_INPUT)!
}

function addButton(container: HTMLElement): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'Add'
  )!
}

function removeButton(container: HTMLElement, name: string): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${name}"]`)
}

function listedNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('li')).map((item) => item.title)
}

describe('ChatBehaviorSetting shell environment', () => {
  const chooseNames = { nativeChatInheritShellEnvironment: false }

  it('hides the variable list while the whole shell is inherited', () => {
    const { container } = renderSetting({})
    expect(container.querySelector(NAME_INPUT)).toBeNull()
  })

  it('turns inheritance off from the toggle', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting({}, updateSettings)
    fireEvent.click(container.querySelector(SHELL_ENV_TOGGLE)!)
    expect(updateSettings).toHaveBeenCalledWith({ nativeChatInheritShellEnvironment: false })
  })

  it('lists the saved names in saved order, or an empty line when there are none', () => {
    const { container, rerender } = renderSetting(chooseNames)
    expect(listedNames(container)).toEqual([])
    expect(container.textContent).toContain('No variables added yet.')

    rerender(
      <ChatBehaviorSetting
        settings={{
          ...getDefaultSettings('/tmp'),
          ...chooseNames,
          nativeChatShellEnvironmentVariables: ['HTTPS_PROXY', 'CODEX_LB_API_KEY']
        }}
        updateSettings={vi.fn()}
      />
    )
    expect(listedNames(container)).toEqual(['HTTPS_PROXY', 'CODEX_LB_API_KEY'])
    expect(container.textContent).not.toContain('No variables added yet.')
  })

  it('adds a typed name from the Add button, clears the input, and keeps focus there', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting(
      { ...chooseNames, nativeChatShellEnvironmentVariables: ['HTTPS_PROXY'] },
      updateSettings
    )
    const input = nameInput(container)
    expect(addButton(container).disabled).toBe(true)

    fireEvent.change(input, { target: { value: ' CODEX_LB_API_KEY ' } })
    expect(addButton(container).disabled).toBe(false)
    fireEvent.click(addButton(container))

    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenCalledWith({
      nativeChatShellEnvironmentVariables: ['HTTPS_PROXY', 'CODEX_LB_API_KEY']
    })
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
  })

  it('adds a typed name on Enter', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting(chooseNames, updateSettings)
    const input = nameInput(container)

    fireEvent.change(input, { target: { value: 'HTTPS_PROXY' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(updateSettings).toHaveBeenCalledWith({
      nativeChatShellEnvironmentVariables: ['HTTPS_PROXY']
    })
    expect(input.value).toBe('')
  })

  it('refuses a name a shell would not accept', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting(chooseNames, updateSettings)
    const input = nameInput(container)

    fireEvent.change(input, { target: { value: 'FOO-BAR' } })
    expect(addButton(container).disabled).toBe(true)
    fireEvent.click(addButton(container))
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(updateSettings).not.toHaveBeenCalled()
    expect(input.value).toBe('FOO-BAR')
  })

  it('does not append a name that is already listed', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting(
      { ...chooseNames, nativeChatShellEnvironmentVariables: ['HTTPS_PROXY'] },
      updateSettings
    )
    const input = nameInput(container)

    fireEvent.change(input, { target: { value: 'HTTPS_PROXY' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(updateSettings).not.toHaveBeenCalled()
    expect(input.value).toBe('')
  })

  it('removes one entry from its chip and moves focus to the input', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting(
      {
        ...chooseNames,
        nativeChatShellEnvironmentVariables: ['HTTPS_PROXY', 'CODEX_LB_API_KEY', 'NO_PROXY']
      },
      updateSettings
    )

    fireEvent.click(removeButton(container, 'CODEX_LB_API_KEY')!)

    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenCalledWith({
      nativeChatShellEnvironmentVariables: ['HTTPS_PROXY', 'NO_PROXY']
    })
    expect(document.activeElement).toBe(nameInput(container))
  })

  it('keeps a half-typed name across an unrelated settings re-render', () => {
    const { container, rerender } = renderSetting(chooseNames)
    fireEvent.change(nameInput(container), { target: { value: 'HTTPS_PRO' } })

    rerender(
      <ChatBehaviorSetting
        settings={{
          ...getDefaultSettings('/tmp'),
          ...chooseNames,
          nativeChatResumeWorkOnRestart: true
        }}
        updateSettings={vi.fn()}
      />
    )

    expect(nameInput(container).value).toBe('HTTPS_PRO')
  })
})

describe('ChatBehaviorSetting queue follow-ups', () => {
  const QUEUE_TOGGLE = '[aria-label="Toggle queue follow-ups"]'

  it('queues text and images by default when the host supports it', () => {
    setLocalRuntimeCapabilitiesForTests([AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY])
    const updateSettings = vi.fn()
    const { container } = renderSetting({}, updateSettings)
    expect(container.textContent).toContain('Enter queues text and images')
    expect(container.textContent).toContain('Turn off to reverse these shortcuts')
    fireEvent.click(container.querySelector(QUEUE_TOGGLE)!)
    expect(updateSettings).toHaveBeenCalledWith({ nativeChatQueueFollowUps: false })
  })

  it('keeps the preference visible but disabled with an explanation on older hosts', () => {
    setLocalRuntimeCapabilitiesForTests([])
    const updateSettings = vi.fn()
    const { getByRole, container } = renderSetting({}, updateSettings)
    const toggle = getByRole('switch', { name: 'Toggle queue follow-ups' })
    expect(toggle.getAttribute('disabled')).not.toBeNull()
    fireEvent.click(toggle)
    expect(updateSettings).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Update Orca on this host')
  })

  it('disables the visible preference while checking the host, then enables it', async () => {
    setLocalRuntimeCapabilitiesForTests(null)
    let answer: (status: { capabilities: string[] }) => void = () => {}
    vi.stubGlobal('api', {
      runtime: { getStatus: () => new Promise((resolve) => (answer = resolve)) }
    })
    const { container } = renderSetting({})
    expect(container.querySelector(QUEUE_TOGGLE)?.getAttribute('disabled')).not.toBeNull()
    expect(container.textContent).toContain('Checking whether this host supports queued messages')
    await act(async () =>
      answer({ capabilities: [AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY] })
    )
    expect(container.querySelector(QUEUE_TOGGLE)?.getAttribute('disabled')).toBeNull()
  })
})

describe('ChatBehaviorSetting resume after restart', () => {
  it('turns automatic resume on from its switch', () => {
    const updateSettings = vi.fn()
    const { getByRole } = renderSetting({ nativeChatResumeWorkOnRestart: false }, updateSettings)
    fireEvent.click(getByRole('switch', { name: 'Toggle automatic resume after a restart' }))
    expect(updateSettings).toHaveBeenCalledWith({ nativeChatResumeWorkOnRestart: true })
  })
})

describe('ChatBehaviorSetting permissions', () => {
  it('shows the new-chat permission picker as the first Behavior row', () => {
    const { container } = renderSetting({ nativeChatPermissionMode: 'full-access' })
    const rows = container.querySelectorAll('.divide-y > *')
    expect(rows[0]?.id).toBe('chat-permissions')
    expect(container.querySelector('button[aria-label="Permissions Full access"]')).not.toBeNull()
  })

  it('leaves the row out when the host has no value', () => {
    const { container } = renderSetting({ nativeChatPermissionMode: undefined })
    expect(container.querySelector('#chat-permissions')).toBeNull()
  })
})

it.each([false, true])(
  'matches Chat copy and search to its API owner typed capability %s',
  (typed) => {
    setLocalRuntimeCapabilitiesForTests(typed ? [AGENT_LAUNCH_PERMISSION_CHOICE_CAPABILITY] : [])
    const { container } = renderSetting({
      nativeChatPermissionMode: 'ask',
      agentPermissionDefault: 'full-access',
      activeRuntimeEnvironmentId: 'unrelated-agents-host'
    })
    const description = getChatPermissionSearchEntry(typed).description
    expect(container.querySelector('#chat-permissions')?.textContent).toContain(description)
    expect(description?.includes('own settings')).toBe(typed)
  }
)
