// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StatusBarVisibilityMenu } from './StatusBarVisibilityMenu'

const { setQuota } = vi.hoisted(() => ({ setQuota: vi.fn(async () => {}) }))

vi.mock('@/runtime/provider-accounts/sign-in/runtime-antigravity-accounts-client', () => ({
  setAntigravityQuotaAutoRefresh: setQuota
}))

afterEach(() => {
  cleanup()
  setQuota.mockClear()
})

function renderMenu(antigravityQuotaEnabled: boolean | undefined) {
  render(
    <StatusBarVisibilityMenu
      controller={{
        antigravityQuotaEnabled,
        detectedAgentIds: [],
        menuOpen: true,
        menuPoint: { x: 0, y: 0 },
        recordFeatureInteraction: vi.fn(),
        remoteOwner: null,
        setMenuOpen: vi.fn(),
        statusBarItems: [],
        toggleStatusBarItem: vi.fn()
      }}
    />
  )
}

it.each([true, false])('offers Antigravity usage with polling enabled=%s', (enabled) => {
  renderMenu(enabled)
  const option = screen.getByRole('menuitemcheckbox', { name: 'Antigravity Usage' })
  expect(option.getAttribute('aria-checked')).toBe(String(enabled))
  fireEvent.click(option)
  expect(setQuota).toHaveBeenCalledWith({ kind: 'local' }, !enabled)
})

it('omits the control for hosts that do not advertise quota polling', () => {
  renderMenu(undefined)
  expect(screen.queryByRole('menuitemcheckbox', { name: 'Antigravity Usage' })).toBeNull()
})
