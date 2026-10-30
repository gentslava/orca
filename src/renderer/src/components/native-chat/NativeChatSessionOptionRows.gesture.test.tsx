// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'
import { CODEX_SESSION_OPTION_CATALOG } from '../../../../shared/agent-session-option-catalog-claude-codex'
import {
  applyStructuredAgentSessionOptions,
  createStructuredAgentSessionOptionState,
  structuredAgentSessionOptionSnapshot
} from '../../../../shared/structured-agent-session-options'
import { NativeChatSessionOptionRows } from './NativeChatSessionOptionRows'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

function effort(values = ['low', 'high']): SessionOptionDescriptor {
  return {
    id: 'effort',
    label: 'Effort',
    category: 'thought_level',
    kind: {
      type: 'select',
      currentValue: 'high',
      choices: values.map((value) => ({ value, label: value === 'low' ? 'Low' : 'High' }))
    },
    valueSource: 'reported',
    transport: 'agent-session',
    settable: true
  }
}

const slider = (): HTMLElement => screen.getByRole('slider', { name: 'Effort' })

function dragRoot(): HTMLElement {
  const root = slider().closest('[data-slot="slider"]')
  if (!(root instanceof HTMLElement)) {
    throw new Error('Missing effort slider root')
  }
  root.getBoundingClientRect = () => new DOMRect(0, 0, 100, 16)
  root.setPointerCapture = vi.fn()
  root.hasPointerCapture = () => true
  root.releasePointerCapture = vi.fn()
  return root
}

function setup() {
  const onSet = vi.fn()
  const rows = (descriptor = effort()) => (
    <NativeChatSessionOptionRows
      options={[descriptor]}
      pendingIds={new Set()}
      shownReason={null}
      onAction={() => {}}
      onSet={onSet}
    />
  )
  const view = render(rows())
  const root = dragRoot()
  fireEvent.pointerDown(root, { pointerId: 1, clientX: 0, clientY: 8 })
  expect(slider().getAttribute('aria-valuetext')).toBe('Low')
  expect(onSet).not.toHaveBeenCalled()
  return { onSet, root, rerender: (descriptor = effort()) => view.rerender(rows(descriptor)) }
}

afterEach(cleanup)

describe('effort drag lifetime', () => {
  it('preserves a draft across equivalent published snapshots and commits on release', () => {
    const { onSet, root, rerender } = setup()
    rerender()
    expect(slider().getAttribute('aria-valuetext')).toBe('Low')
    expect(dragRoot()).toBe(root)
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 0, clientY: 8 })
    expect(onSet).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'effort' }), 'low')
  })

  it('cancels a gesture when the ordered provider choice set changes', () => {
    const { onSet, root, rerender } = setup()
    rerender(effort(['high', 'low']))
    expect(slider().getAttribute('aria-valuetext')).toBe('High')
    expect(dragRoot()).not.toBe(root)
    fireEvent.pointerUp(root, { pointerId: 1, clientX: 0, clientY: 8 })
    expect(onSet).not.toHaveBeenCalled()
  })

  it.each(['pointerCancel', 'lostPointerCapture'] as const)(
    'clears an uncommitted preview on %s',
    (event) => {
      const { onSet, root } = setup()
      fireEvent[event](root, { pointerId: 1 })
      expect(slider().getAttribute('aria-valuetext')).toBe('High')
      expect(onSet).not.toHaveBeenCalled()
    }
  )
})

describe('unlisted effort controls', () => {
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
      <NativeChatSessionOptionRows
        options={structuredAgentSessionOptionSnapshot(state)}
        pendingIds={new Set()}
        shownReason={null}
        onSet={setOption}
        onAction={() => {}}
      />
    )
    expect(screen.queryByRole('slider', { name: 'Effort' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'unsupported-level' })).toBeNull()
    expect(screen.getAllByText('unsupported-level').length).toBeGreaterThan(0)
    expect(setOption).not.toHaveBeenCalled()
  })
})
