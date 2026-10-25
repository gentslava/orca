import { effectiveAgentSessionOptions } from '../../../shared/agent-session-default-model'
import { refuse, type AgentSessionOptionResult } from '../../../shared/agent-session-wire'
import type { AgentSessionTurnContext, TurnOutcome } from './structured-agent-session-turns'
import type { StructuredAgentSessionHostDeps } from './structured-agent-session-host-types'
import { agentSessionOptionAdmitted } from '../../runtime/agent-session-record-options'

/** Read original host configuration, never a resumed thread's current model or a recommendation. */
export async function resetStructuredAgentSessionModel(
  deps: Pick<StructuredAgentSessionHostDeps, 'store' | 'modelCatalog'>,
  ctx: Pick<AgentSessionTurnContext, 'sessionId' | 'fence' | 'now' | 'publish' | 'journal'>,
  hasProviderChild: boolean,
  key: string
): Promise<TurnOutcome<AgentSessionOptionResult>> {
  if (key !== 'model') {
    return {
      ok: false,
      refusal: refuse(
        'agent_session_operation_invalid',
        { reason: 'optionRejected' },
        'Only model can reset to Default'
      )
    }
  }
  const record = deps.store.getRecord(ctx.sessionId)
  const listing =
    record &&
    (await deps.modelCatalog
      ?.read({
        agent: record.provider,
        sessionId: ctx.sessionId,
        inSessionWorkspace: true,
        verifiedOnly: true,
        requireConfiguredDefault: true,
        waitForListing: true
      })
      .catch(() => null))
  const baseline =
    listing?.origin !== 'unknown' && listing?.listingNamesConfiguredModel === true
      ? listing.models.find((model) => model.isDefault)
      : undefined
  const configured =
    listing && listing.origin !== 'unknown' ? listing.defaultModelOptions : undefined
  if (
    !record ||
    (!configured && !baseline && (hasProviderChild || ctx.journal.submissions().length > 0))
  ) {
    return {
      ok: false,
      refusal: refuse(
        'agent_session_operation_invalid',
        { reason: 'optionRejected' },
        "The host has not reported this workspace's original default model. Start a new chat to use the provider default."
      )
    }
  }
  const defaultModelOptions: Record<string, string> =
    configured ?? (baseline ? { model: baseline.id } : {})
  const options = Object.fromEntries(
    Object.entries(record.options ?? {}).filter(
      ([key, value]) =>
        key !== 'model' &&
        agentSessionOptionAdmitted(
          record.provider,
          listing && listing.origin !== 'unknown' ? listing.models : undefined,
          defaultModelOptions.model,
          key,
          value
        )
    )
  )
  const updated = await deps.store.replaceSessionOptions({
    sessionId: ctx.sessionId,
    fence: ctx.fence,
    now: ctx.now(),
    options,
    defaultModelOptions
  })
  ctx.publish()
  return {
    ok: true,
    value: {
      key: 'model',
      value: null,
      modelDefault: true,
      options: effectiveAgentSessionOptions(updated) ?? {}
    }
  }
}
