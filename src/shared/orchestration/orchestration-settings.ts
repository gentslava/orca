import type { WorkerRoleSettings } from '../orchestration-worker-roles'
import {
  NESTED_WORKER_MAX_DEPTH_DEFAULT,
  type NestedWorkerDepthSettings
} from './workers/nested-worker-depth'

export type OrchestrationGlobalSettings = WorkerRoleSettings &
  NestedWorkerDepthSettings & {
    /** Close a finished worker's terminal or chat after a grace period; absent means on. The coordinator's runtime decides. */
    orchestrationWorkerAutoReleaseEnabled?: boolean
    /** Coordinator agents may allow workers' permission prompts on this machine; absent means off. Not in any agent-writable settings RPC. */
    orchestrationCoordinatorApprovalsEnabled?: boolean
  }

export function getDefaultOrchestrationSettings(): Required<OrchestrationGlobalSettings> {
  return {
    nestedWorkerMaxDepth: NESTED_WORKER_MAX_DEPTH_DEFAULT,
    nestedWorkerMaxDepthDefaultedToFour: true,
    orchestrationWorkerRoles: {},
    orchestrationWorkerAutoReleaseEnabled: true,
    orchestrationCoordinatorApprovalsEnabled: false
  }
}
