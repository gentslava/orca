// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, it, expect, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NativeChatSessionOptionPickers } from './NativeChatSessionOptionPickers'
import type { NativeChatOptionPickerRequest } from './native-chat-composer-types'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'
import {
  model as createModel,
  effort as baseEffort
} from './native-chat-option-picker.test-fixture'
const model = createModel()
const effort: SessionOptionDescriptor = {
  ...baseEffort,
  kind: {
    type: 'select',
    currentValue: 'low',
    choices: [
      { value: 'low', label: 'Low' },
      { value: 'high', label: 'High' }
    ]
  }
}
const surface = {
  getSnapshot: () => [],
  setOption: vi.fn(),
  invokeAction: vi.fn(),
  subscribe: () => () => {}
}
const settle = () => act(async () => {})
async function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: /Opus 4.8/ }))
  await settle()
}
afterEach(cleanup)
it('does not focus or change a pending effort when /effort reopens the picker', async () => {
  let finish = () => {}
  const setOption = vi.fn(
    () =>
      new Promise<{ snapshot: SessionOptionDescriptor[] }>((resolve) => {
        finish = () => resolve({ snapshot: [] })
      })
  )
  const view = (request: NativeChatOptionPickerRequest | null) => (
    <TooltipProvider>
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[model, effort]}
        isWorking={false}
        pickerRequest={request}
      />
    </TooltipProvider>
  )
  const { rerender } = render(view(null))
  await openPicker()
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Effort' }), { key: 'End' })
  await settle()
  expect(setOption).toHaveBeenCalledExactlyOnceWith('effort', 'high')
  rerender(view({ id: 'effort', consume: () => {} }))
  await settle()
  const slider = screen.getByRole('slider', { name: 'Effort' })
  expect(slider.closest('[aria-disabled="true"]')).not.toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('combobox'))
  expect(slider.tabIndex).toBe(-1)
  fireEvent.keyDown(slider, { key: 'Home' })
  if (document.activeElement) {
    fireEvent.keyDown(document.activeElement, { key: 'Home' })
  }
  expect(slider.getAttribute('aria-valuetext')).toBe('High')
  expect(setOption).toHaveBeenCalledTimes(1)
  await act(async () => finish())
})
