import { z } from 'zod'
import { lazyZodSchema } from '../schema/lazy-zod-schema'

const UsageProvider = lazyZodSchema(() => z.enum(['claude', 'codex', 'opencode', 'muse']))

export const UsageSnapshotParams = lazyZodSchema(() =>
  z.strictObject({
    provider: UsageProvider,
    scope: z.enum(['orca', 'all']),
    range: z.enum(['7d', '30d', '90d', 'all']),
    limit: z.number().int().min(0).max(1000).optional(),
    includeHistory: z.boolean().optional()
  })
)

export const UsageRefreshParams = lazyZodSchema(() =>
  z.strictObject({
    provider: UsageProvider,
    force: z.boolean().optional()
  })
)

export const UsageSetEnabledParams = lazyZodSchema(() =>
  z.strictObject({
    provider: UsageProvider,
    enabled: z.boolean()
  })
)
