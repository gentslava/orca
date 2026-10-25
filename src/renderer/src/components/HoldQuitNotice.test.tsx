// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Toaster } from 'sonner'
import { HoldQuitNotice } from './HoldQuitNotice'
import type { HoldQuitNotice as Notice } from '../../../shared/mac-hold-quit'

let emit: (notice: Notice) => void = () => {}
const originalApi = window.api
afterEach(() => {
  cleanup()
  window.api = originalApi
})

function mount(): void {
  Object.assign(window, {
    api: {
      ui: {
        onHoldQuitNotice: (callback: typeof emit) => {
          emit = callback
          return vi.fn()
        }
      }
    }
  })
  render(
    <>
      <Toaster />
      <HoldQuitNotice />
    </>
  )
}

it('explains work on first tap and removes progress on release while leaving the reason readable', async () => {
  mount()
  await act(async () => emit({ phase: 'starting' }))
  expect((await screen.findByRole('status')).textContent).toBe(
    'Agents are still working. Hold ⌘Q to quit.'
  )
  expect(screen.queryByRole('progressbar')).toBeNull()
  await act(async () => emit({ phase: 'holding' }))
  expect(await screen.findByRole('progressbar')).toBeDefined()
  await act(async () => emit({ phase: 'released' }))
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
  expect(screen.getByRole('status').textContent).toContain('Agents are still working.')
})

it('offers an explicit menu route if the physical hold cannot be checked', async () => {
  mount()
  await act(async () => emit({ phase: 'unavailable' }))
  await screen.findByText('Hold-to-quit is unavailable. Use the application menu to quit.')
  expect(screen.queryByRole('progressbar')).toBeNull()
})
