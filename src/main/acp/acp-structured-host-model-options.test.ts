import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import {
  NewSessionResponseSchema,
  SetSessionConfigOptionRequestSchema,
  SessionModelStateSchema,
  SetSessionConfigOptionResponseSchema
} from './generated/acp-protocol.generated'
import { acpLaunchSpecFor } from './acp-launch-specs'
import { openHostRig, framesOf, send, stop } from './acp-structured-host.test-support'
import { waitFor } from './acp-structured-adapter.test-support'
import type { AcpScriptedAgent, FakeFrame } from './acp-scripted-agent.test-support'
import {
  CALLER,
  envelope
} from '../native-chat/agent-session-wire/structured-agent-session-host-test-harness'
import {
  HOST_TEST_SESSION as SESSION,
  hostTestAttachParams
} from '../native-chat/agent-session-wire/structured-agent-session-host-test-data'
import { closeProviderTimelineRigs } from '../native-chat/agent-session-timeline/provider-timeline-assembler-test-support'
import { ANTIGRAVITY_SESSION_OPTION_CATALOG } from '../../shared/agent-session-option-catalog-antigravity'
import {
  applyStructuredAgentSessionOptions,
  createStructuredAgentSessionOptionState,
  structuredAgentSessionOptionSnapshot
} from '../../shared/structured-agent-session-options'

const recording = JSON.parse(
  readFileSync(new URL('./fixtures/antigravity-v1.4.3-options.json', import.meta.url), 'utf8')
)
const session = NewSessionResponseSchema.extend({ models: SessionModelStateSchema }).parse(
  recording.session
)
const response = (key: string) => SetSessionConfigOptionResponseSchema.parse(recording[key])
const ANTIGRAVITY = acpLaunchSpecFor('antigravity')!
const FLASH = 'gemini-3.8-flash'
const PRO = 'gemini-3.1-pro'
afterEach(closeProviderTimelineRigs)

async function openModels(
  saved: Readonly<Record<string, string>>,
  metadata: typeof session = { ...session, ...response('low') },
  onModelWrite?: (agent: AcpScriptedAgent, frame: FakeFrame) => void
) {
  const rig = await openHostRig({
    spec: metadata.configOptions
      ? ANTIGRAVITY
      : { ...ANTIGRAVITY, permissionModeConfig: undefined },
    script: (agent) => {
      agent.on('session/new', (frame) => agent.reply(frame, metadata))
      agent.on('session/set_config_option', (frame) => {
        if (SetSessionConfigOptionRequestSchema.parse(frame.params).configId === 'mode') {
          agent.reply(frame, { configOptions: metadata.configOptions })
        } else if (onModelWrite) {
          onModelWrite(agent, frame)
        } else {
          agent.reply(frame, response('pro'))
        }
      })
    }
  })
  expect(
    await rig.host.attach(
      CALLER,
      hostTestAttachParams(null, {
        provider: 'antigravity',
        agent: 'antigravity',
        accountHome: { variable: 'GEMINI_HOME', path: '/unused/antigravity' },
        providerHandle: undefined,
        options: saved
      })
    )
  ).toMatchObject({ ok: true })
  await rig.ready()
  return {
    ...rig,
    modelWrites: () =>
      framesOf(rig.rig.child(), 'session/set_config_option').filter(
        (frame) => SetSessionConfigOptionRequestSchema.parse(frame.params).configId === 'model'
      ),
    pick: (key: string, value: string) => {
      const fields = { key, value }
      return rig.host.setOption(CALLER, {
        envelope: envelope('agentSession.setOption', fields),
        ...fields
      })
    },
    snapshot: async () => {
      const answer = await rig.host.readOptions(SESSION)
      return {
        answer,
        descriptors: structuredAgentSessionOptionSnapshot(
          applyStructuredAgentSessionOptions(
            createStructuredAgentSessionOptionState('antigravity'),
            ANTIGRAVITY_SESSION_OPTION_CATALOG,
            answer
          )
        )
      }
    }
  }
}

it('confirms a saved concrete model only from the same provider response and shares its exact menu', async () => {
  const concrete = 'gemini-3.1-pro-low'
  const rig = await openModels(
    { model: concrete },
    {
      ...session,
      ...response('pro'),
      models: { ...session.models, currentModelId: concrete }
    }
  )
  const { answer, descriptors } = await rig.snapshot()
  expect(answer.current).toMatchObject({
    model: PRO,
    effort: 'low',
    confirmed: ['model', 'effort']
  })
  expect(descriptors.find(({ id }) => id === 'effort')).toMatchObject({
    kind: { currentValue: 'low', choices: [{ value: 'low' }, { value: 'high' }] },
    settable: true
  })
  expect(answer.models.some(({ id }) => id === concrete)).toBe(false)
  expect(rig.store.getRecord(SESSION)?.options).toEqual({ model: concrete })
  expect(rig.modelWrites()).toEqual([])
})

it.each([FLASH, 'gemini-3.8-flash-low', 'opaque/foreign-model'])(
  'keeps a different pending model %s over live confirmation',
  async (model) => {
    const rig = await openModels(
      { model },
      {
        ...session,
        ...response('pro'),
        models: { ...session.models, currentModelId: 'gemini-3.1-pro-low' }
      }
    )
    const { answer } = await rig.snapshot()
    expect(answer.current.model).toBe(model)
    expect(answer.current.confirmed).not.toContain('model')
    expect(rig.store.getRecord(SESSION)?.options?.model).toBe(model)
  }
)

it('writes ready idle model metadata and re-reads the new family menu before any prompt', async () => {
  const rig = await openModels({ model: FLASH, effort: 'low' })
  expect(await rig.pick('model', PRO)).toMatchObject({ ok: true })
  const { answer, descriptors } = await rig.snapshot()
  expect(rig.modelWrites().map(({ params }) => params)).toEqual([
    { sessionId: session.sessionId, configId: 'model', value: PRO }
  ])
  expect(framesOf(rig.rig.child(), 'session/prompt')).toEqual([])
  expect(rig.rig.spawned.filter((step) => step === 'spawn')).toHaveLength(1)
  expect(answer.current).toMatchObject({
    model: PRO,
    effort: 'low',
    confirmed: ['model', 'effort']
  })
  expect(descriptors.find(({ id }) => id === 'effort')).toMatchObject({
    kind: { choices: [{ value: 'low' }, { value: 'high' }] },
    settable: true
  })
})

it('confirms a successful legacy model write from its returned config metadata', async () => {
  const rig = await openModels({ model: FLASH }, undefined, (agent, frame) =>
    agent.reply(frame, response('legacy'))
  )
  expect(await rig.pick('model', 'gemini-3.8-flash-medium')).toMatchObject({ ok: true })
  expect((await rig.snapshot()).answer.current).toMatchObject({
    model: FLASH,
    effort: 'medium',
    confirmed: ['model', 'effort']
  })
  expect(rig.store.getRecord(SESSION)?.options?.model).toBe('gemini-3.8-flash-medium')
})

it('retains intent after a rejected metadata write without confirming the old model as the pick', async () => {
  const rig = await openModels({ model: FLASH, effort: 'low' }, undefined, (agent, frame) =>
    agent.fail(frame, -32602, 'refused')
  )
  expect(await rig.pick('model', PRO)).toMatchObject({ ok: true })
  const { answer } = await rig.snapshot()
  expect(rig.store.getRecord(SESSION)?.options?.model).toBe(PRO)
  expect(answer.current.model).toBe(PRO)
  expect(answer.current.confirmed).not.toContain('model')
  expect(rig.modelWrites()).toHaveLength(1)
  expect(framesOf(rig.rig.child(), 'session/prompt')).toEqual([])
})

it('serializes different model intents while a metadata confirmation is pending', async () => {
  const rig = await openModels({ model: FLASH }, undefined, () => {})
  const first = rig.pick('model', PRO)
  await waitFor(() => expect(rig.modelWrites()).toHaveLength(1))
  const second = rig.pick('model', FLASH)
  const [pro] = rig.modelWrites()
  rig.rig.child().agent.reply(pro!, response('pro'))
  expect(await first).toMatchObject({ ok: true })
  await waitFor(() => expect(rig.modelWrites()).toHaveLength(2))
  const flash = rig.modelWrites()[1]!
  rig.rig.child().agent.reply(flash, response('low'))
  expect(await second).toMatchObject({ ok: true })
  expect(rig.store.getRecord(SESSION)?.options?.model).toBe(FLASH)
  expect((await rig.snapshot()).answer.current.model).toBe(FLASH)
  expect(framesOf(rig.rig.child(), 'session/prompt')).toEqual([])
})

it('lets Stop abort an idle metadata write and ignores its late confirmation', async () => {
  const rig = await openModels({ model: FLASH }, undefined, () => {})
  const picked = rig.pick('model', 'gemini-3.1-pro-low')
  await waitFor(() => expect(rig.modelWrites()).toHaveLength(1))
  const [pending] = rig.modelWrites()
  expect(await stop(rig.host)).toMatchObject({ ok: true })
  expect(await picked).toMatchObject({ ok: true })
  rig.rig.child().agent.reply(pending!, response('pro'))
  await rig.rig.settle()
  const { answer } = await rig.snapshot()
  expect(rig.store.getRecord(SESSION)?.options?.model).toBe('gemini-3.1-pro-low')
  expect(answer.current.model).toBe('gemini-3.1-pro-low')
  expect(answer.current.confirmed).not.toContain('model')
  expect(framesOf(rig.rig.child(), 'session/prompt')).toEqual([])
})

it('leaves model picks deferred while the child is working', async () => {
  const rig = await openModels({ model: FLASH, effort: 'low' })
  await send(rig.host, 'hold this turn')
  await rig.rig.frame('session/prompt')
  const writesBeforePick = rig.modelWrites()
  expect(await rig.pick('model', PRO)).toMatchObject({ ok: true })
  expect(rig.modelWrites()).toEqual(writesBeforePick)
  expect(rig.store.getRecord(SESSION)?.options?.model).toBe(PRO)
})

it('leaves model picks deferred while a queued card is held on an idle child', async () => {
  const rig = await openModels({ model: FLASH, effort: 'low' })
  await rig.host
    .collaboratorsForTests()
    .sessions.get(SESSION)!
    .journal.queuedMessages.insert({
      messageId: 'held-card',
      holdReason: 'send_failed',
      body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'queued' }] }
    })
  expect(await rig.pick('model', PRO)).toMatchObject({ ok: true })
  expect(rig.store.getRecord(SESSION)?.options?.model).toBe(PRO)
  expect(rig.modelWrites()).toEqual([])
  expect(framesOf(rig.rig.child(), 'session/prompt')).toEqual([])
})

it('keeps the old flat-model runtime deferred and preserves its concrete identity', async () => {
  const { configOptions: _config, ...flat } = session
  const rig = await openModels({ model: session.models.currentModelId }, flat)
  expect(await rig.pick('model', 'opaque/old-model')).toMatchObject({ ok: true })
  expect((await rig.snapshot()).answer.current.model).toBe('opaque/old-model')
  expect(rig.modelWrites()).toEqual([])
  expect(framesOf(rig.rig.child(), 'session/set_model')).toEqual([])
})
