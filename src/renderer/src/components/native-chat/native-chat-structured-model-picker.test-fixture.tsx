import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { NativeChatSessionOptionPickers } from './NativeChatSessionOptionPickers'
import { model, effort, fast } from './native-chat-option-picker.test-fixture'

export function defineStructuredModelPickerCases(
  surface: NonNullable<Parameters<typeof NativeChatSessionOptionPickers>[0]['surface']>,
  settle: () => Promise<void>,
  pickEffort: () => boolean
): void {
  it('keeps structured model, effort and Fast choices available for future messages while busy', async () => {
    const busySurface = { ...surface, setOption: vi.fn(async () => ({ snapshot: [] })) }
    const { container } = render(
      <NativeChatSessionOptionPickers
        surface={busySurface}
        snapshot={[
          model({ transport: 'agent-session' }),
          { ...effort, transport: 'agent-session' },
          { ...fast, transport: 'agent-session' }
        ]}
        isWorking
      />
    )
    expect(container.querySelector('[data-disabled=true]')).toBeNull()
    expect(container.textContent).not.toContain('Running and queued messages keep their choices.')
    fireEvent.click(screen.getByRole('option', { name: /Sonnet 5/ }))
    await settle()
    pickEffort()
    await settle()
    fireEvent.click(screen.getByRole('switch'))
    await settle()
    expect(busySurface.setOption.mock.calls).toEqual([
      ['model', 'sonnet'],
      ['effort', 'low'],
      ['fastMode', false]
    ])
  })
  it('shows the proven Default model and its description while retaining the current explicit model', () => {
    render(
      <NativeChatSessionOptionPickers
        isWorking={false}
        surface={{ ...surface, resetOption: vi.fn() }}
        snapshot={[
          model({
            transport: 'agent-session',
            defaultChoice: {
              selected: false,
              model: { value: 'opus', label: 'Opus 5.5', description: 'Most capable model' }
            }
          })
        ]}
      />
    )
    const row = screen.getByRole('option', { name: /Default/ })
    expect(within(row).getByText('Opus 5.5')).toBeDefined()
    expect(within(row).getByText('Most capable model')).toBeDefined()
    expect(row.getAttribute('aria-current')).not.toBe('true')
  })

  it('states when the host has not reported its Default model', () => {
    render(
      <NativeChatSessionOptionPickers
        isWorking={false}
        surface={{ ...surface, resetOption: vi.fn() }}
        snapshot={[model({ transport: 'agent-session', defaultChoice: { selected: false } })]}
      />
    )
    expect(
      within(screen.getByRole('option', { name: /Default/ })).getByText(
        'Default model not reported'
      )
    ).toBeDefined()
  })

  it('offers Default as a reset action without sending a synthetic model id', async () => {
    const resetOption = vi.fn(async () => ({ snapshot: [] }))
    render(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, resetOption }}
        snapshot={[model({ transport: 'agent-session', defaultChoice: { selected: false } })]}
        isWorking={false}
      />
    )
    fireEvent.click(screen.getByRole('option', { name: /Default/ }))
    await settle()
    expect(resetOption).toHaveBeenCalledExactlyOnceWith('model')
    expect(surface.setOption).not.toHaveBeenCalledWith('model', 'default')
  })
}
