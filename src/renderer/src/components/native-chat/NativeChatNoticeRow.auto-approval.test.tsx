// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NativeChatNoticeRow } from './NativeChatNoticeRow'
import type { NativeChatTextBlock } from '../../../../shared/native-chat-types'
import {
  APPROVED_REVIEW,
  COMPACT_APPROVAL_CASES,
  NON_COMPACT_APPROVAL_BLOCKS,
  approvalReviewBlock
} from '../../../../shared/native-chat-activity.test-fixture'

afterEach(cleanup)

describe('automatic approval review activity', () => {
  it.each(['notification:warning', 'notification:guardianWarning'])(
    'discloses the retained successful %s text and payload from a compact row',
    (kind) => {
      const block = approvalReviewBlock()
      render(
        <NativeChatNoticeRow
          block={{
            ...block,
            providerFrame: block.providerFrame && { ...block.providerFrame, kind }
          }}
        />
      )
      const trigger = screen.getByRole('button', { name: 'Automatic approval granted' })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText(APPROVED_REVIEW)).toBeNull()
      expect(document.querySelector('.text-chat-warning')).toBeNull()
      fireEvent.click(trigger)
      expect(screen.getByText(APPROVED_REVIEW)).toBeVisible()
      fireEvent.click(screen.getByText('Details'))
      expect(screen.getByText(block.providerFrame!.payload.head)).toBeInTheDocument()
      fireEvent.click(trigger)
      expect(screen.queryByText(APPROVED_REVIEW)).toBeNull()
    }
  )

  it.each(COMPACT_APPROVAL_CASES)(
    'keeps $label visible while disclosing original rejection details',
    ({ block, label }) => {
      render(<NativeChatNoticeRow block={block} />)
      const trigger = screen.getByRole('button', { name: label })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText(block.text)).toBeNull()
      expect(trigger.querySelector('svg')).toBeInTheDocument()
      fireEvent.click(trigger)
      expect(screen.getByText(block.text)).toBeVisible()
      fireEvent.click(screen.getByText('Details'))
      expect(screen.getByText(block.providerFrame!.payload.head)).toBeVisible()
      fireEvent.click(trigger)
      expect(screen.queryByText(block.text)).toBeNull()
    }
  )

  it.each([
    'Automatic approval review approved (risk: low):',
    'Approval required to run this command.',
    'A warning mentions Automatic approval review approved (risk: low): fine.',
    'Unknown guardian event'
  ])('retains an unknown, failed or blocking notice: %s', (text) => {
    render(<NativeChatNoticeRow block={approvalReviewBlock(text)} />)
    expect(screen.getByText(text)).toBeVisible()
    expect(document.querySelector('.text-chat-warning')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Automatic approval granted' })).toBeNull()
  })

  it.each(NON_COMPACT_APPROVAL_BLOCKS)('retains other error or quoted text: $text', (block) => {
    render(<NativeChatNoticeRow block={block} />)
    expect(screen.getByText(block.text)).toBeVisible()
    expect(screen.queryByRole('button', { expanded: false })).toBeNull()
  })

  it.each<Partial<NativeChatTextBlock>>([
    { providerFrame: undefined },
    { providerFrame: { ...approvalReviewBlock().providerFrame!, provider: 'claude' } },
    {
      providerFrame: { ...approvalReviewBlock().providerFrame!, kind: 'notification:configWarning' }
    },
    { tone: 'error' },
    { failure: { kind: 'notSignedIn' } },
    { presentation: 'compaction-skipped' },
    { usageLimitTurnItemId: 'limit-turn' }
  ])('keeps another source or failure visible: %j', (override) => {
    render(<NativeChatNoticeRow block={{ ...approvalReviewBlock(), ...override }} />)
    expect(screen.getByText(APPROVED_REVIEW)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Automatic approval granted' })).toBeNull()
  })
})
