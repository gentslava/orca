import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultUIState } from '../../../shared/constants'
import {
  writeProjectOrderMode,
  writePersonalProjectPreference
} from './personal-project-order-client'

const fixture = vi.hoisted(() => {
  const capabilities: string[] = []
  return { capabilities, call: vi.fn<(...args: unknown[]) => Promise<unknown>>() }
})
vi.mock('./local-runtime-capabilities', () => ({
  ensureLocalRuntimeCapabilities: async () => fixture.capabilities
}))
vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc: (...args: unknown[]) => fixture.call(...args)
}))
const initial = useAppStore.getState()
afterEach(() => {
  fixture.call.mockReset()
  fixture.capabilities = []
  useAppStore.setState(initial, true)
})

describe('acknowledged project-order controls', () => {
  it('never sends new modes or pin/open payloads to an old host, retaining usable legacy modes', async () => {
    await writeProjectOrderMode('name')
    await writeProjectOrderMode('frequent')
    await writePersonalProjectPreference('ui.setProjectPinned', {
      projectKey: 'github:a',
      pinned: true
    })
    await writePersonalProjectPreference('ui.recordProjectOpen', {
      projectKey: 'github:a',
      previousProjectKey: null
    })
    expect(fixture.call).not.toHaveBeenCalled()
    fixture.call.mockResolvedValue({ ui: { ...getDefaultUIState(), projectOrderBy: 'recent' } })
    await writeProjectOrderMode('recent')
    expect(useAppStore.getState().projectOrderBy).toBe('recent')
  })

  it('shows a new mode only after acknowledgement and reads the host-selected value', async () => {
    fixture.capabilities = ['ui.personalProjectOrder.v1']
    useAppStore.setState({ projectOrderBy: 'manual', persistedUIWriteBaseline: null })
    let answer: ((value: { ui: ReturnType<typeof getDefaultUIState> }) => void) | undefined
    fixture.call.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    const pending = writeProjectOrderMode('name')
    await Promise.resolve()
    await Promise.resolve()
    expect(useAppStore.getState().projectOrderBy).toBe('manual')
    answer?.({ ui: { ...getDefaultUIState(), projectOrderBy: 'frequent' } })
    await pending
    expect(useAppStore.getState().projectOrderBy).toBe('frequent')
    fixture.call.mockRejectedValue(new Error('refused'))
    await expect(writeProjectOrderMode('name')).rejects.toThrow('refused')
    expect(useAppStore.getState().projectOrderBy).toBe('frequent')
  })
})
