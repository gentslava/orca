import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  InitializeResponseSchema,
  NewSessionResponseSchema,
  SessionModelStateSchema,
  SetSessionConfigOptionResponseSchema
} from '../acp/generated/acp-protocol.generated'
import { AcpStructuredOptions, writeAcpSessionOption } from '../acp/acp-structured-options'
import { ANTIGRAVITY_ACP_DIALECT } from '../acp/acp-dialects/antigravity-dialect'
import { ANTIGRAVITY_ACP_RUNTIME } from './antigravity-acp-runtime'
import { AgentModelCatalogStore } from '../native-chat/agent-model-catalog/agent-model-catalog-store'
import { ANTIGRAVITY_SESSION_OPTION_CATALOG } from '../../shared/agent-session-option-catalog-antigravity'
import {
  applyStructuredAgentSessionOptions,
  createStructuredAgentSessionOptionState,
  structuredAgentSessionOptionSnapshot
} from '../../shared/structured-agent-session-options'

const recording = JSON.parse(
  readFileSync(new URL('../acp/fixtures/antigravity-v1.4.3-options.json', import.meta.url), 'utf8')
)
const initialized = InitializeResponseSchema.parse(recording.initialize)
const session = NewSessionResponseSchema.extend({ models: SessionModelStateSchema }).parse(
  recording.session
)
const response = (key: string) => SetSessionConfigOptionResponseSchema.parse(recording[key])
const modelIds = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-pro'
]

function options() {
  const options = new AcpStructuredOptions(ANTIGRAVITY_ACP_DIALECT)
  options.adoptSession(session, 'new')
  return options
}

it.skipIf(ANTIGRAVITY_ACP_RUNTIME.pin() === null)(
  'pins the official release that supplies grouped model and thinking-level config options',
  () => {
    expect(ANTIGRAVITY_ACP_RUNTIME.pin()?.version).toBe(initialized.agentInfo?.version)
    expect(initialized.agentInfo?.version).toBe('1.4.3')
  }
)

it('projects every offered family and only the selected model’s advertised effort menu', () => {
  const listing = options().read()
  expect(listing.models.map(({ id }) => id)).toEqual(modelIds)
  expect(listing.current).toEqual({
    model: 'gemini-3.8-flash',
    effort: 'high',
    confirmed: ['model', 'effort']
  })
  expect(listing.models[0]?.efforts.map(({ value }) => value)).toEqual(['low', 'medium', 'high'])
  expect(listing.models.slice(1).every(({ efforts }) => efforts.length === 0)).toBe(true)
  expect(listing.models.every(({ defaultEffort }) => defaultEffort === undefined)).toBe(true)
})

it('uses thinking_level writes and adopts the server’s model-switch and legacy-id responses', async () => {
  const state = options()
  const writes: unknown[] = []
  const replies = [response('low'), response('pro'), response('high'), response('legacy')]
  const connection = {
    setConfigOption: async (configId: string, value: string | boolean) => {
      writes.push({ configId, value })
      const reply = replies.shift()
      if (!reply) {
        throw new Error('Unexpected option write')
      }
      return reply
    },
    setModel: async () => {
      throw new Error('Config-capable servers must use session/set_config_option')
    }
  }
  for (const [key, value, current] of [
    ['effort', 'low', { model: 'gemini-3.8-flash', effort: 'low' }],
    ['model', 'gemini-3.1-pro', { model: 'gemini-3.1-pro', effort: 'low' }],
    ['effort', 'high', { model: 'gemini-3.1-pro', effort: 'high' }],
    ['model', 'gemini-3.8-flash-medium', { model: 'gemini-3.8-flash', effort: 'medium' }]
  ] as const) {
    const write = state.write(key, value)
    expect(write).not.toBeNull()
    if (!write) {
      throw new Error('Expected writable option')
    }
    await writeAcpSessionOption(connection, state, write, {
      agent: 'Antigravity',
      timeoutMs: 1_000,
      key,
      value
    })
    expect(state.reported()).toEqual(current)
    if (current.model === 'gemini-3.1-pro') {
      expect(
        state
          .read()
          .models.find(({ id }) => id === current.model)
          ?.efforts.map(({ value }) => value)
      ).toEqual(['low', 'high'])
    }
  }
  expect(writes).toEqual([
    { configId: 'thinking_level', value: 'low' },
    { configId: 'model', value: 'gemini-3.1-pro' },
    { configId: 'thinking_level', value: 'high' },
    { configId: 'model', value: 'gemini-3.8-flash-medium' }
  ])
})

it('replaces cached variant rows with the new server’s grouped listing', () => {
  const store = new AgentModelCatalogStore()
  store.recordSuccess(
    'account',
    'antigravity',
    {
      origin: 'live-session',
      models: [
        {
          id: 'gemini-3.8-flash-high',
          label: 'Gemini 3.8 Flash (High)',
          isDefault: false,
          efforts: []
        }
      ]
    },
    'live'
  )
  store.recordSuccess(
    'account',
    'antigravity',
    { ...options().read(), origin: 'live-session' },
    'live'
  )
  expect(store.get('account')?.models.map(({ id }) => id)).toEqual(modelIds)
})

it('shares the host’s exact model and effort descriptors between desktop and mobile', () => {
  const snapshot = structuredAgentSessionOptionSnapshot(
    applyStructuredAgentSessionOptions(
      createStructuredAgentSessionOptionState('antigravity'),
      ANTIGRAVITY_SESSION_OPTION_CATALOG,
      options().read()
    )
  )
  expect(snapshot.map(({ id }) => id)).toEqual(['model', 'effort'])
  expect(snapshot[0]).toMatchObject({
    kind: { currentValue: 'gemini-3.8-flash', choices: modelIds.map((value) => ({ value })) },
    settable: true
  })
  expect(snapshot[1]).toMatchObject({
    kind: {
      currentValue: 'high',
      choices: [{ value: 'low' }, { value: 'medium' }, { value: 'high' }]
    },
    settable: true
  })
})

it('keeps older host metadata flat and never invents an effort control', () => {
  const state = options()
  state.adoptSession({ models: session.models })
  expect(state.read().models).toHaveLength(14)
  expect(state.read().models.every(({ efforts }) => efforts.length === 0)).toBe(true)
  expect(state.write('effort', 'high')).toBeNull()
  expect(state.write('model', 'gemini-3.8-flash-low')).toEqual({
    method: 'model',
    modelId: 'gemini-3.8-flash-low'
  })
})
