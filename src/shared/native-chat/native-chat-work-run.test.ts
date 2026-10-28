import { describe, expect, it } from 'vitest'
import {
  nativeChatWorkRunSpans,
  nativeChatWorkRunMember,
  type NativeChatWorkRunMember,
  type NativeChatWorkRunRow
} from './native-chat-work-run'

import { COMPACT_APPROVAL_CASES, approvalReviewMessage } from '../native-chat-activity.test-fixture'

/** `t` thought, `c` call, `l` lead, `x` a drawn row that ends runs, `-` a row that draws nothing;
 *  `|` starts the next scope. */
function rowsOf(pattern: string): NativeChatWorkRunRow[] {
  const members: Record<string, NativeChatWorkRunMember> = {
    t: 'thought',
    c: 'tool',
    l: 'lead',
    n: 'notice'
  }
  let scope = 0
  return [...pattern].flatMap((char) => {
    if (char === '|') {
      scope += 1
      return []
    }
    return [{ member: members[char] ?? null, draws: char !== '-', scope: String(scope) }]
  })
}

const spans = (pattern: string): number[][] => nativeChatWorkRunSpans(rowsOf(pattern))

describe('work run spans', () => {
  it('runs thoughts and calls together until something else draws', () => {
    expect(spans('tctctxct')).toEqual([
      [0, 1, 2, 3, 4],
      [6, 7]
    ])
  })

  it('needs two members and a call', () => {
    expect(spans('c')).toEqual([])
    expect(spans('tt')).toEqual([])
    expect(spans('txc')).toEqual([])
  })

  it('keeps successful review activity with the calls and with other reviews', () => {
    expect(spans('ncnc')).toEqual([[0, 1, 2, 3]])
    expect(spans('nn')).toEqual([[0, 1]])
    expect(spans('cnxnc')).toEqual([
      [0, 1],
      [3, 4]
    ])
  })

  it('lets a lead head a run but never join one', () => {
    expect(spans('ltclt')).toEqual([
      [0, 1, 2],
      [3, 4]
    ])
    expect(spans('cl')).toEqual([])
  })

  it('stays open across a row that draws nothing', () => {
    expect(spans('c-t-c')).toEqual([[0, 2, 4]])
  })

  it('never crosses a scope, even through a row that draws nothing', () => {
    expect(spans('ct|c')).toEqual([[0, 1]])
    expect(spans('c|-|c')).toEqual([])
  })
})

describe('approval outcomes at work run boundaries', () => {
  it.each(COMPACT_APPROVAL_CASES)('keeps $label outside successful routine work', ({ block }) => {
    const message = { ...approvalReviewMessage('blocked-review'), blocks: [block] }
    expect(nativeChatWorkRunMember(message, false, false)).toBeNull()
    expect(nativeChatWorkRunMember(message, false, true)).toBeNull()
    expect(nativeChatWorkRunMember(approvalReviewMessage('approved-review'), false, false)).toBe(
      'notice'
    )
  })
})
