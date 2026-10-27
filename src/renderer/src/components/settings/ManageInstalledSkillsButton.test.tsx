// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { BundledSkillTarget } from '@/lib/bundled-skill-target'
import { ManageInstalledSkillsButton } from './ManageInstalledSkillsButton'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const runtime = vi.hoisted(() => ({
  target: ((): BundledSkillTarget | null => ({ kind: 'local' }))()
}))
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({ bundledSkillTarget: runtime.target })
}))

let root: Root | null = null
let container: HTMLDivElement | null = null
const originalOpen = useAppStore.getState().openSkillsPage
const open = vi.fn()

beforeEach(() => {
  runtime.target = { kind: 'local' }
  open.mockClear()
  useAppStore.setState({ openSkillsPage: open })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  useAppStore.setState({ openSkillsPage: originalOpen })
})

async function render(target?: BundledSkillTarget | null): Promise<void> {
  await act(async () => root?.render(<ManageInstalledSkillsButton target={target} />))
}

describe('installed skill management navigation', () => {
  it.each([{ kind: 'local' }, { kind: 'environment', environmentId: 'server' }] as const)(
    'opens the existing skill manager for the active $kind host',
    async (target) => {
      runtime.target = target
      await render(target)
      const button = container?.querySelector('button')
      expect(button).not.toBeNull()
      await act(async () => button?.click())
      expect(open).toHaveBeenCalledOnce()
    }
  )

  it('does not route a different or unresolved host to the active host manager', async () => {
    await render({ kind: 'environment', environmentId: 'other' })
    expect(container?.querySelector('button')).toBeNull()
    runtime.target = null
    await render()
    expect(container?.querySelector('button')).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })
})
