import type { AcpLaunchSpec } from '../launch/acp-launch-contract'
import { acpLaunchSpecForAccount } from '../launch/acp-launch-command'
import type { AgentSessionAccountHome } from '../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import { AcpAgentError } from '../transport/acp-errors'
import { AgentModelCatalogProbeError } from '../../native-chat/agent-model-catalog/agent-model-catalog-probe-runner'
import { AgentModelCatalogUnavailableError } from '../../native-chat/agent-model-catalog/agent-model-catalog-unavailable'

export function acpSignedOutError(spec: AcpLaunchSpec): AgentModelCatalogUnavailableError {
  const account = spec.dialect.signInAccount
  return new AgentModelCatalogUnavailableError({
    reason: 'notSignedIn',
    ...(account ? { account } : {})
  })
}

function acpModelCatalogAuthError(error: unknown, spec: AcpLaunchSpec): unknown {
  const commandSignedOut =
    error instanceof AgentModelCatalogProbeError &&
    (error.reason === 'exit' || error.reason === 'timeout') &&
    error.failedExit !== undefined &&
    spec.modelDiscovery.kind === 'command' &&
    spec.modelDiscovery.isNotSignedInOutput?.(
      `${error.failedExit.stdout}\n${error.failedExit.stderr}`
    ) === true
  return (error instanceof AcpAgentError && error.code === -32000) || commandSignedOut
    ? acpSignedOutError(spec)
    : error
}

/** Rethrows a listing failure, as the account's sign-in when that is what failed. */
export function rethrowAcpSignedOut(agentSpec: AcpLaunchSpec, home: AgentSessionAccountHome) {
  return (error: unknown): never => {
    throw acpModelCatalogAuthError(error, acpLaunchSpecForAccount(agentSpec, home))
  }
}
