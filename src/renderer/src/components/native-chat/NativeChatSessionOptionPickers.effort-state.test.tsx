// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import './native-chat-option-picker-ui.test-fixture'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, it, expect, vi } from 'vitest'
import { NativeChatSessionOptionPickers } from './NativeChatSessionOptionPickers'
import { model, effort, unknownEffort } from './native-chat-option-picker.test-fixture'
import { CODEX_SESSION_OPTION_CATALOG } from '../../../../shared/agent-session/options/agent-session-option-catalog-claude-codex'
import {
  applyStructuredAgentSessionOptions,
  createStructuredAgentSessionOptionState
} from '../../../../shared/agent-session/options/structured-agent-session-options'
import { structuredAgentSessionOptionSnapshot } from '../../../../shared/agent-session/options/structured-agent-session-option-snapshot'
const surface = {
  getSnapshot: () => [],
  setOption: vi.fn(),
  invokeAction: vi.fn(),
  subscribe: () => () => {}
}
const effortSlider = (): HTMLElement => screen.getByRole('slider', { name: 'Effort' })
const pickEffort = (key = 'Home'): boolean => fireEvent.keyDown(effortSlider(), { key })
afterEach(cleanup)
it('keeps the current effort passive and adjusts it only through the slider', async () => {
  const setOption = vi.fn().mockResolvedValue({ snapshot: [] })
  render(
    <NativeChatSessionOptionPickers
      surface={{ ...surface, setOption }}
      snapshot={[model(), effort]}
      isWorking={false}
    />
  )
  expect(screen.queryByRole('button', { name: 'High' })).toBeNull()
  fireEvent.click(screen.getAllByText('High')[0]!)
  expect(setOption).not.toHaveBeenCalled()
  expect(effortSlider().tabIndex).toBe(0)
  expect(effortSlider().getAttribute('aria-valuetext')).toBe('High')
  pickEffort('Home')
  await waitFor(() => expect(setOption).toHaveBeenCalledExactlyOnceWith('effort', 'low'))
})

it('keeps an unlisted reported effort read-only through the actual snapshot pipeline', () => {
  const state = applyStructuredAgentSessionOptions(
    createStructuredAgentSessionOptionState('codex'),
    CODEX_SESSION_OPTION_CATALOG,
    {
      models: [
        {
          id: 'account-model',
          label: 'Account Model',
          isDefault: true,
          efforts: [
            { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' }
          ]
        }
      ],
      current: { model: 'account-model', effort: 'unsupported-level', confirmed: ['effort'] }
    }
  )
  const setOption = vi.fn()
  render(
    <NativeChatSessionOptionPickers
      surface={{ ...surface, setOption }}
      snapshot={structuredAgentSessionOptionSnapshot(state)}
      isWorking={false}
    />
  )
  expect(screen.queryByRole('slider', { name: 'Effort' })).toBeNull()
  expect(screen.queryByRole('radio', { name: 'unsupported-level' })).toBeNull()
  expect(screen.getAllByText('unsupported-level').length).toBeGreaterThan(0)
  expect(setOption).not.toHaveBeenCalled()
})

it('keeps an unknown effort unreported until a supported choice is committed', async () => {
  const setOption = vi.fn().mockResolvedValue({ snapshot: [] })
  render(
    <NativeChatSessionOptionPickers
      surface={{ ...surface, setOption }}
      snapshot={[model(), unknownEffort]}
      isWorking={false}
    />
  )
  const group = screen.getByRole('radiogroup', { name: 'Effort' })
  expect(screen.queryByRole('slider')).toBeNull()
  expect(
    within(group)
      .getAllByRole('radio')
      .every((radio) => radio.getAttribute('aria-checked') === 'false')
  ).toBe(true)
  expect(setOption).not.toHaveBeenCalled()
  fireEvent.click(within(group).getByRole('radio', { name: 'High' }))
  await waitFor(() => expect(setOption).toHaveBeenCalledExactlyOnceWith('effort', 'high'))
})
