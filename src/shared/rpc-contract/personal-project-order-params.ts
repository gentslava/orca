import { z } from 'zod'
import { lazyZodSchema } from '../schema/lazy-zod-schema'

const ProjectKey = lazyZodSchema(() => z.string().min(1).max(2048))
const OperationId = lazyZodSchema(() =>
  z
    .object({
      writer: z.string().min(1).max(128),
      seq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
    })
    .strict()
)

export const RecordProjectOpenParams = lazyZodSchema(() =>
  z
    .object({
      projectKey: ProjectKey,
      previousProjectKey: ProjectKey.nullable(),
      opId: OperationId
    })
    .strict()
)
export const SetProjectPinnedParams = lazyZodSchema(() =>
  z
    .object({
      projectKey: ProjectKey,
      pinned: z.boolean(),
      opId: OperationId
    })
    .strict()
)

export type RecordProjectOpenRequest = z.infer<typeof RecordProjectOpenParams>
export type SetProjectPinnedRequest = z.infer<typeof SetProjectPinnedParams>
