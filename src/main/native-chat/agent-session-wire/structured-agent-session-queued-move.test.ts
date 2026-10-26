import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  createQueuedMessageTestRig,
  eventually,
  QUEUED_RIG_CALLER,
  type QueuedMessageTestRig
} from './structured-agent-session-queued-message-rig.test-fixture'
import {
  hostTestMessage,
  hostTestOperationId,
  HOST_TEST_SESSION as SESSION
} from './structured-agent-session-host-test-data'

let rig: QueuedMessageTestRig
beforeEach(async () => {
  rig = await createQueuedMessageTestRig()
})
afterEach(() => rig.dispose())

function move(
  messageId: string,
  beforeMessageId: string | null,
  operationId = hostTestOperationId()
) {
  const fields = { messageId, beforeMessageId }
  return rig.host.queuedMessageMove(QUEUED_RIG_CALLER, {
    envelope: rig.envelope(fields, 'agentSession.queuedMessageMove', operationId),
    ...fields
  })
}

async function queue(text: string) {
  const sent = await rig.send(text, 'queue-if-active').result
  if (!sent.ok || !('queued' in sent.value)) {
    throw new Error('expected queued message')
  }
  return sent.value.queued.messageId
}

it('reorders and edits durable image cards without changing attachments or captured options', async () => {
  const working = await rig.workingSend()
  const first = await queue('first')
  const body = hostTestMessage('with image')
  body.blocks.push({ type: 'image-ref', path: '/tmp/queued.png' })
  const choices = { model: 'model-a', effort: 'high' }
  const fields = { body, delivery: 'queue-if-active' as const, options: choices }
  const sent = await rig.host.send(QUEUED_RIG_CALLER, {
    envelope: rig.envelope(fields, 'agentSession.send', hostTestOperationId()),
    ...fields
  })
  if (!sent.ok || !('queued' in sent.value)) {
    throw new Error('expected queued image')
  }
  const image = sent.value.queued.messageId
  const last = await queue('last')
  expect(await move(image, first)).toMatchObject({ ok: true, value: { moved: true } })
  expect((await rig.drafts()).map((card) => card.messageId)).toEqual([image, first, last])
  const journal = rig.host.collaboratorsForTests().sessions.get(SESSION)?.journal
  const card = journal?.queuedMessages.get(image)
  if (!card) {
    throw new Error('expected image card')
  }
  const edit = {
    messageId: image,
    expectedBodyFingerprint: card.fingerprint,
    text: 'edited image caption'
  }
  expect(
    await rig.host.queuedMessageUpdate(QUEUED_RIG_CALLER, {
      envelope: rig.envelope(edit, 'agentSession.queuedMessageUpdate', hostTestOperationId()),
      ...edit
    })
  ).toMatchObject({ ok: true, value: { status: 'updated' } })
  await rig.restartHostProcess()
  const history = await rig.host.history({ sessionId: SESSION, direction: 'tail' })
  if (!history.ok) {
    throw new Error('history refused')
  }
  expect(history.page.queuedMessages?.map((entry) => entry.messageId)).toEqual([image, first, last])
  expect(history.page.queuedMessages?.[0]?.body.blocks).toEqual([
    { type: 'text', text: 'edited image caption' },
    { type: 'image-ref', path: '/tmp/queued.png' }
  ])
  await rig.deleteQueued(first)
  expect((await rig.drafts()).map((entry) => entry.messageId)).toEqual([image, last])
  await rig.settleAccepted(working, 'finished')
  expect(await rig.sendNow(image)).toMatchObject({ ok: true })
  await eventually(async () => expect((await rig.handoff(image))?.options).toMatchObject(choices))
})

it('replays a move without undoing a later reorder and ignores stale deleted targets', async () => {
  await rig.workingSend()
  const a = await queue('a')
  const b = await queue('b')
  const c = await queue('c')
  const operation = hostTestOperationId()
  expect(await move(c, a, operation)).toMatchObject({ ok: true, value: { moved: true } })
  expect(await move(a, c)).toMatchObject({ ok: true, value: { moved: true } })
  expect(await move(c, a, operation)).toMatchObject({
    ok: true,
    replayed: true,
    value: { moved: true }
  })
  expect((await rig.drafts()).map((card) => card.messageId)).toEqual([a, c, b])
  await rig.deleteQueued(c)
  expect(await move(b, c)).toMatchObject({ ok: true, value: { moved: false } })
  expect((await rig.drafts()).map((card) => card.messageId)).toEqual([a, b])
})
