// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: rpc.call,
  subscribeStructuredAgentSessionStatus: async () => ({ unsubscribe: () => {} })
}))
vi.mock('@/runtime/structured-agent-session-host-capability', () => ({
  useStructuredAgentSessionHostCapability: () => true,
  useStructuredAgentSessionOwnPermissionState: () => 'supported',
  useStructuredAgentSessionHostCapabilityState: () => 'unknown',
  structuredAgentSessionHostKey: () => 'local'
}))
vi.mock('./native-chat-session-option-settings-write', () => ({
  enqueueSessionOptionSettingsWrite: () => Promise.resolve()
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    Object.entries(values ?? {}).reduce(
      (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
      fallback
    )
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { NativeChatSessionOptionPickers } from './NativeChatSessionOptionPickers'
import { useStructuredAgentSessionOptions } from './use-structured-agent-session-options'
import { useStructuredAgentSessionSendOptions } from './use-structured-agent-session-send-options'
import { forgetStructuredSessionSelection } from '@/lib/structured-agent-session-selection-controller'

const target = { kind: 'local' } as const
const sessionId = 'mid-turn-picker'
afterEach(() => {
  cleanup()
  forgetStructuredSessionSelection(sessionId)
})

it('refreshes the composer model from host execution reports without changing captured input', async () => {
  let reportedModel = 'claude-opus-5-5'
  const sent: unknown[] = []
  rpc.call.mockImplementation(async (_target, method) => {
    if (method === 'agentSession.options') {
      return {
        models: [{ id: 'claude-opus-5-5', label: 'Opus 5.5', efforts: [] }],
        current: {
          model: 'claude-opus-5-5',
          reportedModel,
          defaulted: [],
          acceptedInputSources: { model: 'saved' }
        }
      }
    }
    if (method === 'agentSession.modelCatalog') {
      return { origin: 'unknown' }
    }
    throw new Error(`Unexpected RPC ${method}`)
  })
  function Composer({ stamp }: { stamp: string }) {
    const options = useStructuredAgentSessionOptions({
      agent: 'claude',
      sessionId,
      target,
      fence: 1,
      transportEnabled: true,
      isVisible: true,
      providerVisible: true,
      providerRunning: true,
      turnId: 'running',
      unloadedTurnRevisions: undefined,
      hostOptionStamp: stamp,
      mutate: async () => null
    })
    const capture = useStructuredAgentSessionSendOptions(sessionId, undefined, options.sendSource)
    return (
      <TooltipProvider>
        <NativeChatSessionOptionPickers
          surface={options.optionSurface}
          snapshot={options.optionSnapshot}
          isWorking={true}
        />
        <button onClick={() => sent.push(capture())}>Capture next message</button>
      </TooltipProvider>
    )
  }
  const { rerender } = render(<Composer stamp={reportedModel} />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Next turn: Model (Claude )?Opus 5\.5$/ })).toBeTruthy()
  )
  reportedModel = 'claude-opus-4-8'
  rerender(<Composer stamp={reportedModel} />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Next turn: Model (Claude )?Opus 4\.8$/ })).toBeTruthy()
  )
  fireEvent.click(screen.getByText('Capture next message'))
  expect(sent).toEqual([{ selection: { model: 'claude-opus-5-5' } }])
  reportedModel = 'claude-opus-5-5'
  rerender(<Composer stamp={reportedModel} />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Next turn: Model (Claude )?Opus 5\.5$/ })).toBeTruthy()
  )
})
