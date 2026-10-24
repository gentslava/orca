import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentSessionRecordFixture } from '../../shared/agent-session-record.test-fixture'
import { agentSessionRefusalNotice } from '../../shared/agent-session-refusal-notice'
import {
  closeProviderTimelineRigs,
  messageText
} from '../native-chat/agent-session-timeline/provider-timeline-assembler-test-support'
import { failedAcquisitionSettlement } from '../native-chat/agent-session-wire/structured-agent-session-failed-create-refusal'
import { structuredAgentSessionStartFailure } from '../native-chat/agent-session-wire/structured-agent-session-failure-text'
import { createAcpStructuredLaunchResolver } from '../runtime/structured-agent-launch-composition.test-support'
import { acpLaunchSpecFor } from '../acp/acp-launch-specs'
import {
  openAcpAdapterRig,
  PROVIDER_SESSION,
  sendHello,
  waitFor
} from '../acp/acp-structured-adapter.test-support'
import {
  GEMINI_ACP_INITIALIZE,
  GEMINI_ACP_SESSION,
  scriptGeminiAcpSession
} from './gemini-acp.test-fixture'

afterEach(closeProviderTimelineRigs)
const GEMINI = acpLaunchSpecFor('gemini')!
const resume = {
  sessionId: PROVIDER_SESSION,
  key: 'gemini-saved-link',
  mayBeUnsaved: () => false,
  unannouncedLosses: () => []
}

describe('Gemini native reopen safety', () => {
  it('refuses before any process or account lookup, preserves journal history, and offers an honest next step', async () => {
    const record = {
      ...agentSessionRecordFixture(),
      provider: 'gemini',
      accountHome: { variable: 'GEMINI_CLI_HOME', path: '/accounts/pinned' },
      providerHandleChain: [
        {
          linkId: 'gemini-saved-link',
          handle: { transport: 'acp', agent: 'gemini', nativeId: PROVIDER_SESSION },
          origin: 'created' as const,
          mintedAtFence: 1,
          observedAt: 1
        }
      ]
    }
    const readJournal = vi.fn(() => null)
    const resolveEnvironment = vi.fn(async () => ({}))
    const probeVersion = vi.fn(async () => ({ version: '0.65.0' }))
    const resolveLaunch = createAcpStructuredLaunchResolver(GEMINI, {
      store: { getRecord: () => record, pinLaunchDirectory: vi.fn() },
      readJournal,
      resolveEnvironment,
      probeVersion
    })
    const rig = await openAcpAdapterRig({ spec: GEMINI, deps: { resolveLaunch } })
    await rig.rig.eventSink.appendItem(
      { provider: 'orca', clientMessageId: 'old' },
      {
        kind: 'message',
        role: 'user',
        blocks: [{ type: 'text', text: 'Saved conversation' }]
      },
      { turnScope: { kind: 'thread' } }
    )
    const before = await rig.rig.rows()
    let failure: unknown
    try {
      await rig.acquire()
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({
      name: 'AgentSessionPreSpawnError',
      reason: 'providerResumeUnavailable'
    })
    expect(structuredAgentSessionStartFailure({ error: failure }, { agentName: 'Gemini' })).toEqual(
      {
        reason:
          'Gemini cannot safely reopen this chat. Start a new chat or continue in the terminal.',
        rejection: { kind: 'providerResumeUnavailable' }
      }
    )
    const settlement = failedAcquisitionSettlement(failure, { record, newSession: false })
    expect(settlement).toMatchObject({
      exitProof: 'processless',
      outcome: {
        status: 'failed',
        details: { reason: 'providerResumeUnavailable' },
        message:
          'Gemini cannot safely reopen this chat. Start a new chat or continue in the terminal.'
      }
    })
    expect(
      agentSessionRefusalNotice(
        {
          code: 'agent_session_operation_invalid',
          message: 'Ignored provider diagnostic',
          details: { reason: 'providerResumeUnavailable' }
        },
        'composer-send',
        { agentName: 'Gemini CLI' }
      )
    ).toContain(
      'Gemini CLI cannot safely reopen this chat. Start a new chat or continue in the terminal.'
    )
    expect(rig.spawned).toEqual([])
    expect(resolveEnvironment).not.toHaveBeenCalled()
    expect(readJournal).not.toHaveBeenCalled()
    expect(probeVersion).not.toHaveBeenCalled()
    expect(await rig.rig.rows()).toEqual(before)
  })

  it('demonstrates why a load-response boundary cannot separate original unmarked replay from a new answer', async () => {
    const rig = await openAcpAdapterRig({
      spec: GEMINI,
      initialize: GEMINI_ACP_INITIALIZE,
      launch: { resume },
      script: (agent) => {
        scriptGeminiAcpSession(agent)
        agent.on('session/load', (frame) => {
          agent.notify('session/update', {
            sessionId: PROVIDER_SESSION,
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'History before load response' }
            }
          })
          agent.reply(frame, GEMINI_ACP_SESSION)
        })
        agent.on('session/prompt', (frame) => {
          // The CLI's unawaited streamHistory may still be writing after the next request arrives.
          for (const text of ['Late history. ', 'New answer.']) {
            agent.notify('session/update', {
              sessionId: PROVIDER_SESSION,
              update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } }
            })
          }
          agent.reply(frame, { stopReason: 'end_turn' })
        })
      }
    })
    // The scripted launch bypasses the production pre-spawn guard to exercise the unsafe contract.
    await rig.acquire()
    await sendHello(rig, 'new-prompt')
    await waitFor(async () =>
      expect((await rig.rig.rows()).flatMap((row) => messageText(row.body) ?? [])).toEqual([
        'Late history. New answer.'
      ])
    )
    expect(rig.sent('session/new')).toEqual([])
    expect(rig.sent('session/resume')).toEqual([])
  })
})
