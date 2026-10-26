import type { UsageProvider } from '../usage/usage-provider-contract'
import { scanOpenCodeUsageDatabasesViaWorker } from '../usage/usage-scan-worker-spawn'
import type { OpenCodeUsageDailyAggregate, OpenCodeUsageSession } from './types'

// Why: v4 reads OpenCode 2's `session_v2` table; v3 caches miss every v2 session.
// v5 merges a migrated session's two rows per column instead of picking one, so
// v4 caches hold zeroed costs and pre-migration metadata.
// v6 normalizes input; v7 preserves writes separately for telemetry.
// Retain session identity in daily rows for period-correct drilldowns.
export const OPENCODE_USAGE_SCHEMA_VERSION = 8

export const openCodeUsageProvider = {
  id: 'opencode',
  label: 'OpenCode',
  schemaVersion: OPENCODE_USAGE_SCHEMA_VERSION,
  scan: scanOpenCodeUsageDatabasesViaWorker
} satisfies UsageProvider<OpenCodeUsageSession, OpenCodeUsageDailyAggregate>
