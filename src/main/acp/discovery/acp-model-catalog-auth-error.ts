import type { AcpLaunchSpec } from '../launch/acp-launch-contract'
import { AcpAgentError } from '../transport/acp-errors'
import { AgentModelCatalogProbeError } from '../../native-chat/agent-model-catalog/agent-model-catalog-probe-runner'
import { AgentModelCatalogUnavailableError } from '../../native-chat/agent-model-catalog/agent-model-catalog-unavailable'
export function acpModelCatalogAuthError(error: unknown, spec: AcpLaunchSpec): unknown {
  const account = spec.dialect.signInAccount
  const commandSignedOut =
    error instanceof AgentModelCatalogProbeError &&
    (error.reason === 'exit' || error.reason === 'timeout') &&
    error.failedExit !== undefined &&
    spec.modelDiscovery.kind === 'command' &&
    spec.modelDiscovery.isNotSignedInOutput?.(
      `${error.failedExit.stdout}\n${error.failedExit.stderr}`
    ) === true
  return (error instanceof AcpAgentError && error.code === -32000) || commandSignedOut
    ? new AgentModelCatalogUnavailableError({
        reason: 'notSignedIn',
        ...(account ? { account } : {})
      })
    : error
}
