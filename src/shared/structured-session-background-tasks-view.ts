// The background-tasks strip's view of one session's wire state.
//
// Hosts select background work; newer clients also exclude their current turn's commands
// from an older host's roster. Child agents and earlier commands stay visible mid-turn.

import type {
  AgentSessionBackgroundTask,
  AgentSessionBackgroundTaskState
} from './agent-session-wire'
import { agentChildWorkLiveness } from './agent-status-child-work-liveness'
import type { AgentChildWorkView } from './agent-status-child-work-view'

export type StructuredSessionBackgroundTasksView = {
  /** Background rows remain visible during a foreground turn. */
  show: boolean
  /** Idle-only: gates the animated monitoring indicator and conversation
   *  commands, never the strip itself. A running turn owns the voice. */
  isMonitoring: boolean
  tasks: AgentSessionBackgroundTask[]
  settledTasks: AgentSessionBackgroundTask[]
  /** The host's child records, when it publishes them; the rows then read these. */
  children?: AgentChildWorkView[]
  supportsStop: boolean
  /** The strip's untargeted Stop: offered when no row has a Stop of its own and the host has an
   *  untargeted stop, or, with no turn running, for work no row lists, which the host reaches by
   *  ending the agent whatever stops its provider offers. */
  offersStopAll: boolean
  /** Some running work is not listed: the strip stays, and says details are unavailable. */
  incomplete: boolean
}

/** One shared empty list: a roster with no rows of a kind keeps the strip's memo on every render. */
const NO_TASKS: AgentSessionBackgroundTask[] = []
const NO_FOREGROUND_COMMANDS: ReadonlySet<string> = new Set()

function withoutForeground<T>(
  rows: T[],
  foreground: ReadonlySet<string>,
  id: (row: T) => string | undefined
): T[] {
  const visible = (row: T) => !foreground.has(id(row) ?? '')
  return rows.every(visible) ? rows : rows.filter(visible)
}

export function structuredSessionBackgroundTasksView(
  backgroundTasks: AgentSessionBackgroundTaskState | null | undefined,
  turnId: string | null,
  foregroundCommands: ReadonlySet<string> = NO_FOREGROUND_COMMANDS
): StructuredSessionBackgroundTasksView {
  const monitoring = backgroundTasks?.state === 'monitoring'
  // Decoded once where the frame entered the client's state, so its identity holds between frames.
  const children =
    monitoring && backgroundTasks.children
      ? withoutForeground(backgroundTasks.children, foregroundCommands, (child) => child.providerId)
      : undefined
  const tasks = withoutForeground(
    backgroundTasks?.tasks ?? NO_TASKS,
    foregroundCommands,
    (task) => task.id
  )
  const settledTasks = backgroundTasks?.settledTasks ?? NO_TASKS
  const onlyForeground =
    foregroundCommands.size > 0 &&
    !children?.length &&
    !tasks.length &&
    !settledTasks.length &&
    Boolean(backgroundTasks?.children?.length || backgroundTasks?.tasks?.length)
  const incomplete = monitoring && backgroundTasks.incomplete === true
  const show = monitoring && (incomplete || !onlyForeground)
  // Commands and rewind follow the listed records, as the host's own admission does.
  const liveWork = children
    ? agentChildWorkLiveness(children) !== null
    : tasks.length > 0 || (show && !settledTasks.length)
  const supportsStop = backgroundTasks?.supportsTaskStop === true
  return {
    show,
    isMonitoring: turnId === null && liveWork,
    tasks,
    settledTasks,
    ...(children ? { children } : {}),
    supportsStop,
    // Absent means the host predates the field and does accept an untargeted
    // stop; only a host that says `false` has none to offer.
    offersStopAll:
      (!supportsStop && liveWork && backgroundTasks?.supportsStopAll !== false) ||
      (incomplete && turnId === null),
    incomplete
  }
}

/** The run of the task the strip lists under `providerId`, live or settled: its record's
 *  invocation, since a provider can reuse one id across a child's runs (a Codex sub-agent's thread),
 *  or the id itself on an older host's roster. Null when the strip does not list it. */
export function structuredSessionListedTaskRun(
  view: StructuredSessionBackgroundTasksView,
  providerId: string
): string | null {
  if (!view.show) {
    return null
  }
  if (!view.children) {
    return view.tasks.some((task) => task.id === providerId) ? providerId : null
  }
  const child = view.children.find((candidate) => candidate.providerId === providerId)
  return child ? `${child.invocation.invocationId}#${child.invocation.generation}` : null
}

/** The host-confirmed Stops, by provider id and the run each was pressed on, whose run the strip
 *  still lists, each holding its row's button; the same map when none has left, so a caller can
 *  tell when to drop the rest. */
export function structuredSessionConfirmedStopsStillListed(
  view: StructuredSessionBackgroundTasksView,
  confirmed: ReadonlyMap<string, string>
): ReadonlyMap<string, string> {
  const listed = [...confirmed].filter(
    ([providerId, run]) => structuredSessionListedTaskRun(view, providerId) === run
  )
  return listed.length === confirmed.size ? confirmed : new Map(listed)
}
