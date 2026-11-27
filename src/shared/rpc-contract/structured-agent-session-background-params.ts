import { z } from 'zod'
import { lazyZodSchema } from '../schema/lazy-zod-schema'
import { MutationEnvelope } from './structured-agent-session/structured-agent-session-mutation-envelope'
import { AgentSessionForegroundTaskSchema } from '../agent-session/agent-session-foreground-task'

export const BackgroundTaskParams = lazyZodSchema(() =>
  z
    .object({
      envelope: MutationEnvelope,
      target: AgentSessionForegroundTaskSchema
    })
    .strict()
)
