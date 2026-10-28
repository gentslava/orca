// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  asyncQuestionMessage,
  asyncQuestionOptions,
  asyncQuestionTitle,
  orchestrationNoticeMessage
} from '../../../../shared/native-chat/input/native-chat-async-question.test-fixture'
import { fireEvent } from '@testing-library/react'
import { NativeChatStructuredAsyncQuestion } from './NativeChatStructuredAsyncQuestion'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const asked: NativeChatMessage = {
  id: 'ask',
  role: 'assistant',
  blocks: [
    { type: 'text', text: 'Which color?\n- Red\n- Blue' },
    {
      type: 'tool-call',
      name: 'request_user_input_async',
      input: { questions: [{ title: 'Which color?', options: ['Red', 'Blue'] }] }
    }
  ],
  timestamp: null,
  source: 'transcript'
}

describe('NativeChatStructuredAsyncQuestion', () => {
  it('retires answered history and withholds an unsettled transcript', () => {
    const send = vi.fn(() => true)
    const render = (messages: NativeChatMessage[], readPhase: 'ready' | 'loading' = 'ready') =>
      act(() =>
        root.render(
          <NativeChatStructuredAsyncQuestion
            paneKey="async-history"
            session={{ messages, readPhase }}
            send={send}
          />
        )
      )
    const pending = [asyncQuestionMessage, orchestrationNoticeMessage]
    render(pending, 'loading')
    expect(container.querySelector('input')).toBeNull()
    render(pending)
    expect(container.querySelector('input')).not.toBeNull()
    render([
      ...pending,
      {
        id: 'human-answer',
        role: 'user',
        blocks: [{ type: 'text', text: asyncQuestionOptions[0]! }],
        timestamp: 3,
        source: 'transcript'
      },
      { ...orchestrationNoticeMessage, id: 'later-notice', timestamp: 4 }
    ])
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('button[aria-pressed]')).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it.each(['option', 'text'])(
    'keeps %s answer controls after an orchestration notice reaches Codex',
    (answerKind) => {
      const send = vi.fn(() => true)
      act(() =>
        root.render(
          <NativeChatStructuredAsyncQuestion
            paneKey={`async-notice-${answerKind}`}
            session={{
              messages: [asyncQuestionMessage, orchestrationNoticeMessage],
              readPhase: 'ready'
            }}
            send={send}
          />
        )
      )
      expect(container.textContent).toContain(asyncQuestionTitle)
      const options = [...container.querySelectorAll('button[aria-pressed]')]
      expect(options.map((option) => option.textContent)).toEqual(
        expect.arrayContaining(
          asyncQuestionOptions.map((option) => expect.stringContaining(option))
        )
      )
      const input = container.querySelector('input')
      expect(input).not.toBeNull()
      if (answerKind === 'option') {
        const option = options.find((node) => node.textContent?.includes(asyncQuestionOptions[1]!))!
        act(() => option.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        act(() => vi.runAllTimers())
      } else {
        act(() =>
          fireEvent.change(input!, { target: { value: 'Android is still on the old APK' } })
        )
        const submit = [...container.querySelectorAll('button')].find((node) =>
          node.textContent?.includes('Submit')
        )!
        act(() => submit.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      }
      expect(send).toHaveBeenCalledExactlyOnceWith(
        `> ${asyncQuestionTitle}\n\n${answerKind === 'option' ? asyncQuestionOptions[1] : 'Android is still on the old APK'}`,
        []
      )
      expect(container.textContent).not.toContain(asyncQuestionTitle)
    }
  )

  it('answers a Codex async question with an ordinary send, then hides it', () => {
    const send = vi.fn(() => true)
    act(() =>
      root.render(
        <NativeChatStructuredAsyncQuestion
          paneKey="tab-1:structured"
          session={{ messages: [asked], readPhase: 'ready' }}
          send={send}
        />
      )
    )
    const blue = [...container.querySelectorAll('button[aria-pressed]')].find((node) =>
      node.textContent?.includes('Blue')
    )
    act(() => blue?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    act(() => vi.runAllTimers())

    expect(send).toHaveBeenCalledWith('> Which color?\n\nBlue', [])
    expect(container.textContent).not.toContain('Which color?')
  })
})
