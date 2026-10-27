import { createContext, type ReactElement } from 'react'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { MobileNativeChatRowKeys } from './native-chat/transcript/mobile-native-chat-row-keys'

// Hold below-reader growth during scrolling because corrective writes stop iOS flings; notify only growing rows.
export type MobileNativeChatGrowthHold = {
  held: () => boolean
  subscribe: (onChange: () => void) => () => void
}

export function createMobileNativeChatGrowthHold(): MobileNativeChatGrowthHold & {
  set: (held: boolean) => void
} {
  let held = false
  const listeners = new Set<() => void>()
  return {
    held: () => held,
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    set: (next) => {
      if (next !== held) {
        held = next
        listeners.forEach((onChange) => onChange())
      }
    }
  }
}

const NEVER_HELD: MobileNativeChatGrowthHold = { held: () => false, subscribe: () => () => {} }

export const MobileNativeChatGrowthHoldContext =
  createContext<MobileNativeChatGrowthHold>(NEVER_HELD)

export type MobileNativeChatHeldRows = {
  rows: readonly NativeChatMessage[]
  footer: ReactElement | null
  // Freeze renderItem too: grouping/turn context changes a row even if its message is unchanged.
  renderItem: (row: { item: NativeChatMessage; index: number }) => ReactElement
}

export function mobileNativeChatHeldRows(
  held: MobileNativeChatHeldRows | null,
  liveRows: readonly NativeChatMessage[],
  rowKeys: Pick<MobileNativeChatRowKeys, 'keyOf'>,
  runs?: ReadonlyMap<number, readonly NativeChatMessage[]>
) {
  const unheld = { rows: liveRows, heldFrom: Infinity, heldAt: 0 }
  const head = held?.rows[0]
  const at = head ? liveRows.findIndex((row) => rowKeys.keyOf(row) === rowKeys.keyOf(head)) : -1
  if (!held || at === -1) {
    return unheld
  }
  // A newly prepended run head owns its held members; draw those members live.
  let last: NativeChatMessage | undefined
  for (const [index, members] of runs ?? []) {
    if (index >= at) {
      break
    }
    last = members.at(-1)
  }
  const from = Math.max(at, last ? liveRows.indexOf(last, at) + 1 : 0)
  const kept = liveRows.slice(at, from).every((row, i) => {
    const was = held.rows[i]
    return was !== undefined && rowKeys.keyOf(was) === rowKeys.keyOf(row)
  })
  return kept
    ? {
        rows: [...liveRows.slice(0, from), ...held.rows.slice(from - at)],
        heldFrom: from,
        heldAt: at
      }
    : unheld
}
