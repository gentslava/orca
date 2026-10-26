import type { JournalQueueCardChange } from './journal-queue-events'
import { isUnsettledQueuedMessage, type QueuedMessageRow } from './queued-message-table'

export function queuedMessageMoveChanges(
  rows: readonly QueuedMessageRow[],
  input: { messageId: string; beforeMessageId: string | null }
): JournalQueueCardChange[] {
  const cards = rows.filter(isUnsettledQueuedMessage)
  const moving = cards.find((card) => card.messageId === input.messageId)
  const target = cards.find((card) => card.messageId === input.beforeMessageId)
  if (!moving || input.messageId === input.beforeMessageId || (input.beforeMessageId && !target)) {
    return []
  }
  const reordered = cards.filter((card) => card !== moving)
  reordered.splice(target ? reordered.indexOf(target) : reordered.length, 0, moving)
  return reordered.flatMap((card, index) => {
    const position = cards[index].position
    return card.position === position
      ? []
      : [{ messageId: card.messageId, change: { op: 'moved', position } }]
  })
}
