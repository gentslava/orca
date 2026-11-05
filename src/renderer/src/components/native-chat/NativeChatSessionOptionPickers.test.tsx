// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) => {
    if (!values) {
      return fallback
    }
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
      fallback
    )
  }
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

// Keep mocked rows mounted for assertions.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="picker-root" data-open={open ? 'true' : 'false'}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <div data-disabled={disabled || undefined}>{children}</div>
  ),
  PopoverContent: ({
    children,
    side,
    align,
    collisionPadding
  }: {
    children: React.ReactNode
    side?: string
    align?: string
    collisionPadding?: number
  }) => (
    <div
      data-testid="picker-content"
      data-side={side}
      data-align={align}
      data-collision-padding={collisionPadding}
    >
      {children}
    </div>
  )
}))

import { NativeChatSessionOptionPickers } from './NativeChatSessionOptionPickers'
import { model, effort } from './native-chat-option-picker.test-fixture'

const surface = {
  getSnapshot: vi.fn(() => []),
  setOption: vi.fn(),
  invokeAction: vi.fn(),
  subscribe: vi.fn(() => vi.fn())
}

const pill = (name: string): HTMLElement => screen.getByRole('button', { name })
const effortSlider = (): HTMLElement => screen.getByRole('slider', { name: 'Effort' })
const pickEffort = (key = 'Home'): boolean => fireEvent.keyDown(effortSlider(), { key })

afterEach(() => cleanup())

describe('NativeChatSessionOptionPickers', () => {
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
    screen.getByRole('option', { name: /Default/ }).click()
    await waitFor(() => expect(resetOption).toHaveBeenCalledExactlyOnceWith('model'))
    expect(surface.setOption).not.toHaveBeenCalledWith('model', 'default')
  })

  it('keeps structured model, effort and Fast choices available for future messages while busy', async () => {
    const busySurface = { ...surface, setOption: vi.fn(async () => ({ snapshot: [] })) }
    const fast: SessionOptionDescriptor = {
      id: 'fastMode', label: 'Fast mode', category: 'mode',
      kind: { type: 'boolean', currentValue: true }, valueSource: 'applied',
      transport: 'agent-session', settable: true
    }
    render(<NativeChatSessionOptionPickers surface={busySurface}
      snapshot={[model({ transport: 'agent-session' }), { ...effort, transport: 'agent-session' }, fast]}
      isWorking />)
    screen.getByRole('option', { name: 'Sonnet 5' }).click()
    await waitFor(() => expect(busySurface.setOption).toHaveBeenCalledWith('model', 'sonnet'))
    pickEffort()
    await waitFor(() => expect(busySurface.setOption).toHaveBeenCalledWith('effort', 'low'))
    screen.getByRole('switch').click()
    await waitFor(() => expect(busySurface.setOption).toHaveBeenCalledWith('fastMode', false))
  })
  it('shows concurrent model and effort picks and releases only the settled descriptor', async () => {
    let settleWrite: () => void = () => {}
    let settleModel: () => void = () => {}
    const setOption = vi.fn(
      (id: string) =>
        new Promise<{ snapshot: SessionOptionDescriptor[] }>((resolve) => {
          if (id === 'model') {
            settleModel = () => resolve({ snapshot: [] })
          } else {
            settleWrite = () => resolve({ snapshot: [] })
          }
        })
    )
    render(
      <NativeChatSessionOptionPickers
        surface={{ ...surface, setOption }}
        snapshot={[model(), effort]}
        isWorking={false}
      />
    )
    const held = (): (string | null | undefined)[] => [
      screen.getByRole('listbox').getAttribute('aria-busy'),
      screen
        .getByRole('slider', { name: 'Effort' })
        .closest('[data-busy]')
        ?.getAttribute('aria-disabled')
    ]
    expect(held()).toEqual(['false', 'false'])

    pickEffort()
    await waitFor(() =>
      expect(effortSlider().getAttribute('aria-valuetext')).toBe('Low')
    )
    expect(pill('Model Opus 4.8, Effort Low')).not.toBeNull()
    expect(held()).toEqual(['false', 'true'])
    screen.getByRole('option', { name: 'Sonnet 5' }).click()
    expect(setOption.mock.calls).toEqual([
      ['effort', 'low'],
      ['model', 'sonnet']
    ])
    await waitFor(() => expect(held()).toEqual(['true', 'true']))
    pickEffort('End')
    expect(setOption).toHaveBeenCalledTimes(2)

    // The snapshot is the truth once the write settles; here it still says High.
    await act(async () => settleWrite())
    await waitFor(() => expect(held()).toEqual(['true', 'false']))
    expect(effortSlider().getAttribute('aria-valuetext')).toBe('High')
    await act(async () => settleModel())
    await waitFor(() => expect(held()).toEqual(['false', 'false']))
  })
})
