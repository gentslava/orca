import '../unused-default-rpc-methods.test-fixture'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  closeTestStores,
  createStore,
  testState
} from '../../../persistence/persistence-test-harness'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { CLIENT_UI_METHODS } from './client-ui'

beforeEach(() => {
  testState.dir = mkdtempSync(join(tmpdir(), 'orca-conversation-preferences-'))
})
afterEach(async () => {
  await closeTestStores()
  rmSync(testState.dir, { recursive: true, force: true })
})

it('merges concurrent host-qualified conversation changes through RPC and persists restore across restart', async () => {
  const store = createStore()
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    getUIState: () => store.getUI(),
    updateUIState: (updates: Parameters<typeof store.updateUI>[0]) => {
      store.updateUI(updates)
      return store.getUI()
    }
  }
  // SAFETY: this registry only reads runtime identity and UI state, which the real profile store supplies.
  const dispatcher = new RpcDispatcher({
    runtime: runtime as unknown as OrcaRuntimeService,
    methods: CLIENT_UI_METHODS
  })
  const remote = JSON.stringify(['ssh:alpha', 'structured', 'same-session'])
  const local = JSON.stringify(['local', 'structured', 'same-session'])
  const mutate = (id: string, params: unknown) =>
    dispatcher.dispatch({ id, authToken: 'tok', method: 'ui.setConversationPreference', params })

  const responses = await Promise.all([
    mutate('pin-remote', { key: remote, pinned: true }),
    mutate('archive-remote', { key: remote, archived: true }),
    mutate('pin-local', { key: local, pinned: true })
  ])
  expect(responses).toEqual([
    expect.objectContaining({ ok: true }),
    expect.objectContaining({ ok: true }),
    expect.objectContaining({ ok: true })
  ])
  expect(store.getUI().conversationPreferences).toEqual({
    revision: 3,
    entries: { [remote]: { pinned: true, archived: true }, [local]: { pinned: true } }
  })

  expect(await mutate('restore-remote', { key: remote, archived: false })).toMatchObject({
    ok: true,
    result: { preferences: { revision: 4 } }
  })
  expect(
    await dispatcher.dispatch({
      id: 'resize',
      authToken: 'tok',
      method: 'ui.set',
      params: { sidebarWidth: 280 }
    })
  ).toMatchObject({ ok: true })
  store.flush()
  await closeTestStores()

  const reopened = createStore()
  expect(reopened.getUI()).toMatchObject({
    sidebarWidth: 280,
    conversationPreferences: {
      revision: 4,
      entries: { [remote]: { pinned: true, archived: false }, [local]: { pinned: true } }
    }
  })
})
