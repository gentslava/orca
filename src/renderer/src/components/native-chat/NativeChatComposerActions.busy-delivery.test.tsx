// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { render } from './native-chat-tooltip-test-harness'
import { afterEach, it, expect, vi } from 'vitest'
import { NativeChatComposerActions } from './NativeChatComposerActions'
afterEach(cleanup)
it('keeps delivery preferences out of the busy composer', () => {
  const onStop = vi.fn()
  render(
    <NativeChatComposerActions
      attachDisabled={false}
      dictationDisabled={false}
      sendDisabled={false}
      isWorking
      isDictating={false}
      isDictationHoldMode={false}
      onAttach={vi.fn()}
      onDictationToggle={vi.fn()}
      onDictationHoldStart={vi.fn()}
      onDictationHoldEnd={vi.fn()}
      onSend={vi.fn()}
      onStop={onStop}
      sessionOptionsSurface={null}
      sessionOptionsSnapshot={[]}
    />
  )
  expect(screen.queryByRole('button', { name: 'Queue' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Draft actions' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Stop the agent' }))
  expect(onStop).toHaveBeenCalledOnce()
})
