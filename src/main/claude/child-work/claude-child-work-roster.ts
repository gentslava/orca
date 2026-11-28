import { record } from '../background-tasks/claude-background-task-frames'
import {
  claudeRosterAliasId,
  claudeRosterEntries,
  type DecodedClaudeTask
} from './claude-child-work-evidence'

export function claudeRosterStarts(
  message: Record<string, unknown>,
  known: {
    live: ReadonlyMap<string, DecodedClaudeTask>
    ended: ReadonlyMap<string, unknown>
    parentOf: (id: string, run?: string) => string | undefined
  },
  confirmRunning: (id: string, frame: Record<string, unknown>) => void
): [string, Record<string, unknown>][] {
  if (!Array.isArray(message.tasks)) {
    return []
  }
  return claudeRosterEntries(message.tasks).flatMap(
    ({ live, id, task }): [string, Record<string, unknown>][] => {
      if (live) {
        confirmRunning(id, task)
      }
      return !known.ended.has(id) &&
        (known.live.has(id) || known.parentOf(id, claudeRosterAliasId(task)))
        ? [[id, task]]
        : []
    }
  )
}

/** Whether this frame ends the lead's turn (`result`). A tool result instead marks the live tasks whose
 *  own call it answers, the lead's or a subagent's (forwarded with its parent_tool_use_id); only those
 *  can be survivors, so a stray or late `result` never touches a command whose call still runs. */
export function claudeLeadTurnEnded(
  message: Record<string, unknown>,
  live: Map<string, DecodedClaudeTask>
): boolean {
  if (message.type === 'result') {
    return true
  }
  const content = message.type === 'user' ? record(message.message)?.content : undefined
  if (!Array.isArray(content)) {
    return false
  }
  const answered = new Set(
    content.flatMap((block) => {
      const entry = record(block)
      return entry?.type === 'tool_result' && typeof entry.tool_use_id === 'string'
        ? [entry.tool_use_id]
        : []
    })
  )
  for (const [id, task] of live) {
    if (task.toolUseId !== undefined && answered.has(task.toolUseId) && !task.answered) {
      live.set(id, { ...task, answered: true })
    }
  }
  return false
}

/** A foreground command blocks the call that waits on it (the lead's turn, or its subagent), so one
 *  still live once that call is over either missed its ending or kept running unseen. Views hide
 *  foreground commands, so it is surfaced as background work whose state is unverified, rather than
 *  left hidden while it holds the session's status open, or settled while it may still run. */
export function claudeForegroundCommandSurvivors(
  live: ReadonlyMap<string, DecodedClaudeTask>,
  ownerId: string | undefined,
  /** The journal's attribution of a tool call to the subagent that made it, for a task Claude
   *  announced without parent_task_id; the same owner the published evidence carries. */
  ownerOf?: (toolUseId: string) => string | null
): [string, DecodedClaudeTask][] {
  return [...live].flatMap(([id, task]): [string, DecodedClaudeTask][] => {
    const attributed =
      task.toolUseId !== undefined ? (ownerOf?.(task.toolUseId) ?? undefined) : undefined
    // A task is never its own owner, as the published evidence also refuses.
    const claimed = task.parentTaskId ?? attributed
    const owner = claimed !== id ? claimed : undefined
    // At the lead's turn end only a command whose own call returned can be a survivor, so a stray or
    // late `result` never touches one still running. Once its owning subagent has ended, none can be.
    const due = ownerId === undefined ? task.answered === true : true
    return task.kind === 'command' && !task.backgrounded && due && owner === ownerId
      ? [[id, { ...task, backgrounded: true, uncertain: true }]]
      : []
  })
}

/** Any later frame for a task is evidence of its state, so an unverified survivor stops being one. */
export function claudeTaskSeenAgain(task: DecodedClaudeTask): DecodedClaudeTask {
  const seen = { ...task }
  delete seen.uncertain
  return seen
}

/** The marks a refreshed task keeps: waiting on agents, and that its own call has returned, the latter
 *  only while it is the same run (a new tool call is a new run that has not returned yet). */
export function claudeCarriedMarks(
  existing: DecodedClaudeTask | undefined,
  toolUseId: string | undefined,
  awaitsAgents = false
): Pick<DecodedClaudeTask, 'awaitsAgents' | 'answered'> {
  return {
    ...(awaitsAgents || existing?.awaitsAgents ? { awaitsAgents: true as const } : {}),
    ...(existing?.answered && existing.toolUseId === toolUseId ? { answered: true as const } : {})
  }
}
