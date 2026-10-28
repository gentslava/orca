// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { render } from './native-chat-tooltip-test-harness'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Why: these fixtures have neither inline visual owners nor sender navigation.
const unusedChatLeaves = vi.hoisted(() => ({
  inlineVisual: vi.fn(() => {
    throw new Error('Unexpected inline visual in transcript fixture')
  }),
  openSender: vi.fn(() => {
    throw new Error('Unexpected sender navigation in transcript fixture')
  })
}))
vi.mock('./NativeChatInlineVisual', () => ({
  NativeChatInlineVisual: unusedChatLeaves.inlineVisual
}))
vi.mock('@/lib/open-agent-message-sender', () => ({
  openAgentMessageSender: unusedChatLeaves.openSender
}))
afterEach(() => {
  expect(unusedChatLeaves.inlineVisual).not.toHaveBeenCalled()
  expect(unusedChatLeaves.openSender).not.toHaveBeenCalled()
})
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { MessageRow } from './NativeChatMessageRow'
import {
  buildNativeChatTranscriptSlots,
  nativeChatSlotIndexOf,
  type NativeChatMessageSlot
} from './native-chat-transcript-slots'
import {
  APPROVED_REVIEW,
  approvalReviewMessage
} from '../../../../shared/native-chat-activity.test-fixture'
import { openToolRunMembers } from './native-chat-tool-run-members-test-support'

afterEach(() => {
  cleanup()
})

function thought(id: string, body: string): NativeChatMessage {
  return {
    id,
    role: 'reasoning',
    blocks: [{ type: 'text', text: body }],
    timestamp: 1000,
    completedAt: 4000,
    state: 'completed',
    source: 'transcript'
  }
}

function command(id: string, cmd: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [
      { type: 'tool-call', name: 'Bash', input: { command: cmd }, state: 'completed', callId: id },
      { type: 'tool-result', output: 'ok', callId: id }
    ],
    timestamp: 1,
    source: 'transcript'
  }
}

describe('message row drawing a work run', () => {
  it('speaks for its calls alone, and reads its thoughts in order once opened', () => {
    const first = thought('r1', 'Check the log first.')
    const { container } = render(
      <MessageRow
        message={first}
        workRun={[
          first,
          command('a', 'ls logs'),
          thought('r2', 'Now search it.'),
          command('b', 'rg error logs'),
          thought('r3', 'That settles it.')
        ]}
        expandSignal={false}
        activeTurnIsWorking={false}
        onScrollMessageToTop={() => {}}
      />
    )
    const header = container.querySelector('button')!
    expect(header).toHaveTextContent('Ran 2 commands')
    expect(screen.queryByText(/Thought/)).not.toBeInTheDocument()

    fireEvent.click(header)
    const order = Array.from(
      container.querySelectorAll('button'),
      (button) => button.textContent ?? ''
    ).slice(1)
    const at = (pattern: RegExp) => order.findIndex((label) => pattern.test(label))
    expect(order.filter((label) => /Thought for 3s/.test(label))).toHaveLength(3)
    expect(at(/ls logs/)).toBeGreaterThan(at(/Thought for 3s/))
    expect(at(/rg error logs/)).toBeGreaterThan(at(/ls logs/))
    expect(order.at(-1)).toMatch(/Thought for 3s/)
  })

  it("draws a run headed by the agent's words under them", () => {
    const head: NativeChatMessage = {
      ...command('a', 'ls logs'),
      blocks: [{ type: 'text', text: 'Looking at the logs.' }, ...command('a', 'ls logs').blocks]
    }
    const { container } = render(
      <MessageRow
        message={head}
        workRun={[head, thought('r1', 'Now search it.'), command('b', 'rg error logs')]}
        expandSignal={false}
        activeTurnIsWorking={false}
        onScrollMessageToTop={() => {}}
      />
    )
    expect(screen.getByText('Looking at the logs.')).toBeInTheDocument()
    const header = container.querySelector('[data-native-chat-tool-run-state]')!
    expect(header).toHaveTextContent('Ran 2 commands')
    fireEvent.click(header)
    expect(screen.getByText(/Thought for 3s/)).toBeInTheDocument()
  })

  it.each(['review-first', 'tool-first'])(
    'retains consecutive review and tool activity behind one closed row: %s',
    (order) => {
      const review = approvalReviewMessage('review')
      const action = command('action', 'pnpm test')
      const members = order === 'review-first' ? [review, action] : [action, review]
      const slots = activitySlots(members)
      expect(slots).toHaveLength(1)
      expect(slots[0]?.workRun).toEqual(members)
      expect(nativeChatSlotIndexOf(slots, 'action')).toBe(0)
      expect(nativeChatSlotIndexOf(slots, 'review')).toBe(0)
      const { container } = render(
        <MessageRow
          message={members[0]!}
          workRun={slots[0]?.workRun}
          expandSignal={false}
          onScrollMessageToTop={() => {}}
        />
      )
      const header = container.querySelector('[data-native-chat-tool-run-state]')!
      expect(header).toHaveAttribute('aria-expanded', 'false')
      expect(container.querySelectorAll('[data-native-chat-tool-run-state]')).toHaveLength(1)
      expect(screen.queryByText(APPROVED_REVIEW)).toBeNull()
      expect(screen.queryByText('ok')).toBeNull()
      fireEvent.click(header)
      expect(screen.getByText(APPROVED_REVIEW)).toBeVisible()
      expect(
        container.querySelector('[data-native-chat-activity-message-id="review"]')
      ).not.toBeNull()
      openToolRunMembers()
      expect(screen.getByText('ok')).toBeVisible()
    }
  )

  it('groups successive reviews even before their tool arrives', () => {
    const members = [
      approvalReviewMessage('review-a'),
      approvalReviewMessage('review-b', APPROVED_REVIEW.replace('local check', 'file read'))
    ]
    const slots = activitySlots(members)
    const { container } = render(
      <MessageRow
        message={members[0]!}
        workRun={slots[0]?.workRun}
        expandSignal={false}
        onScrollMessageToTop={() => {}}
      />
    )
    const header = container.querySelector('[data-native-chat-tool-run-state]')!
    expect(header).toHaveTextContent('Activity')
    expect(container.querySelectorAll('button')).toHaveLength(1)
    fireEvent.click(header)
    expect(screen.getByText(APPROVED_REVIEW)).toBeVisible()
    expect(screen.getByText(APPROVED_REVIEW.replace('local check', 'file read'))).toBeVisible()
  })

  it('keeps prose visible between activity groups and retains streaming output on expansion', () => {
    const prose: NativeChatMessage = {
      id: 'explanation',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'The first check passed; I am checking the next file.' }],
      timestamp: 1,
      source: 'transcript'
    }
    const running: NativeChatMessage = {
      ...command('running', 'pnpm tc'),
      blocks: [
        {
          type: 'tool-call',
          name: 'Bash',
          input: { command: 'pnpm tc' },
          callId: 'running',
          state: 'running'
        },
        { type: 'tool-result', output: 'checking a.ts', callId: 'running' }
      ]
    }
    const slots = activitySlots([
      command('a', 'pnpm test'),
      approvalReviewMessage('review'),
      prose,
      running
    ])
    expect(slots.map((slot) => slot.message.id)).toEqual(['a', 'explanation', 'running'])
    const { container, rerender } = render(
      <>
        {slots.map((slot) => (
          <MessageRow
            key={slot.message.id}
            message={slot.message}
            workRun={slot.workRun}
            expandSignal={false}
            activeTurnIsWorking={true}
            trailingRun={slot.message.id === 'running'}
            onScrollMessageToTop={() => {}}
          />
        ))}
      </>
    )
    expect(screen.getByText('The first check passed; I am checking the next file.')).toBeVisible()
    const headers = container.querySelectorAll('[data-native-chat-tool-run-state]')
    expect(headers).toHaveLength(2)
    for (const header of headers) {
      expect(header).toHaveAttribute('aria-expanded', 'false')
    }
    fireEvent.click(headers[1]!)
    openToolRunMembers()
    expect(screen.getByText('checking a.ts')).toBeVisible()
    const updated = {
      ...running,
      blocks: running.blocks.map((block) =>
        block.type === 'tool-result' ? { ...block, output: 'checking a.ts\nchecking b.ts' } : block
      )
    }
    const next = activitySlots([
      command('a', 'pnpm test'),
      approvalReviewMessage('review'),
      prose,
      updated
    ])
    rerender(
      <>
        {next.map((slot) => (
          <MessageRow
            key={slot.message.id}
            message={slot.message}
            workRun={slot.workRun}
            expandSignal={false}
            activeTurnIsWorking={true}
            trailingRun={slot.message.id === 'running'}
            onScrollMessageToTop={() => {}}
          />
        ))}
      </>
    )
    expect(screen.getByText(/checking b.ts/)).toBeVisible()
  })

  it('keeps recoverable tool failures inside the same collapsed activity group', () => {
    const failed: NativeChatMessage = {
      ...command('failed', 'pnpm tc'),
      blocks: [
        {
          type: 'tool-call',
          name: 'Bash',
          input: { command: 'pnpm tc' },
          callId: 'failed',
          state: 'failed'
        },
        { type: 'tool-result', callId: 'failed', output: 'Type error in a.ts', isError: true }
      ]
    }
    const members = [command('a', 'pnpm test'), failed, command('b', 'pnpm tc --pretty false')]
    const slots = activitySlots(members)
    expect(slots).toHaveLength(1)
    expect(slots[0]?.workRun).toEqual(members)
    const { container } = render(
      <MessageRow
        message={members[0]!}
        workRun={slots[0]?.workRun}
        expandSignal={false}
        activeTurnIsWorking={true}
        onScrollMessageToTop={() => {}}
      />
    )
    const header = container.querySelector('[data-native-chat-tool-run-state]')!
    expect(header).toHaveTextContent('Running 3 commands')
    expect(header).toHaveTextContent('1 failed')
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Type error in a.ts')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(header)
    openToolRunMembers()
    expect(screen.getByText('Type error in a.ts')).toBeVisible()
  })

  it('ends activity at unknown guardian warnings, real questions, and final blockers', () => {
    const warning = approvalReviewMessage('warning', 'Review required before continuing.')
    const blocker: NativeChatMessage = {
      id: 'blocker',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'I could not finish because the host is unavailable.' }],
      timestamp: 1,
      source: 'transcript'
    }
    const question: NativeChatMessage = {
      ...command('question', ''),
      blocks: [
        {
          type: 'tool-call',
          name: 'AskUserQuestion',
          input: { questions: [{ question: 'Which host should I use?' }] },
          state: 'running'
        }
      ]
    }
    for (const boundary of [warning, question, blocker]) {
      const slots = activitySlots([
        command('a', 'one'),
        approvalReviewMessage('review-a'),
        boundary,
        approvalReviewMessage('review-b'),
        command('b', 'two')
      ])
      expect(slots.map((slot) => slot.message.id)).toEqual(['a', boundary.id, 'review-b'])
      expect(slots[1]?.workRun).toBeUndefined()
      const view = render(
        <MessageRow
          message={boundary}
          expandSignal={false}
          activeTurnIsWorking={true}
          onScrollMessageToTop={() => {}}
        />
      )
      if (boundary === warning) {
        expect(screen.getByText('Review required before continuing.')).toBeVisible()
      }
      if (boundary === blocker) {
        expect(
          screen.getByText('I could not finish because the host is unavailable.')
        ).toBeVisible()
      }
      if (boundary === question) {
        expect(screen.getByText('Which host should I use?')).toBeVisible()
      }
      view.unmount()
    }
  })
})

function activitySlots(messages: NativeChatMessage[]): NativeChatMessageSlot[] {
  return buildNativeChatTranscriptSlots({
    messages,
    turnKeys: messages.map(() => 'turn'),
    liveTurnKey: undefined,
    receipts: new Map(),
    turnStatuses: { active: null, completedByTurn: {} },
    turnDiffs: new Map(),
    expandedTurnKeys: new Set(),
    isWorking: false,
    lifecycleWorking: false
  }).filter((slot): slot is NativeChatMessageSlot => slot.kind === 'message')
}
