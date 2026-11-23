import type { AcpLaunchSpec } from '../launch/acp-launch-contract'
import { acpLaunchSpecForAccount } from '../launch/acp-launch-command'
import type { AgentSessionAccountHome } from '../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import { acpAuthenticationRequired } from '../turns/acp-prompt-failure'
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
  const acpSignedOut =
    error instanceof AcpAgentError &&
    (error.code === -32000 || acpAuthenticationRequired(spec.dialect, error))
  return acpSignedOut || commandSignedOut ? acpSignedOutError(spec) : error
}

/** Rethrows a listing failure, as the account's sign-in when that is what failed. A listing often
 *  reaches a signed-out server before any chat sends; answering lets a chat offer its sign-in choices
 *  without a failed send first. */
export function rethrowAcpSignedOut(
  agentSpec: AcpLaunchSpec,
  home: AgentSessionAccountHome,
  answerSignIn?: (signedIn: boolean) => void
) {
  return (error: unknown): never => {
    const mapped = acpModelCatalogAuthError(error, acpLaunchSpecForAccount(agentSpec, home))
    if (mapped !== error) {
      answerSignIn?.(false)
    }
    throw mapped
  }
}
