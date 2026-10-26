import { defineFixture } from '../../component-fixtures/component-fixture'
import type { NativeChatTextBlock } from '../../../../shared/native-chat-types'
import { NativeChatNoticeRow } from './NativeChatNoticeRow'

const text =
  "Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Irreversible Deletion (general)]. If you have other tasks that don't depend on this action, continue working on those."
const payload = JSON.stringify({
  type: 'system',
  subtype: 'permission_denied',
  message: text
})
const block: NativeChatTextBlock = {
  type: 'text',
  text,
  tone: 'error',
  providerFrame: {
    provider: 'claude',
    kind: 'message:system:permission_denied',
    payload: {
      head: payload,
      byteLength: payload.length,
      digest: 'classifier-denial',
      truncated: false
    }
  }
}

export const collapsedClassifierDenials = defineFixture({
  width: 640,
  render: () => (
    <div className="native-chat-appearance space-y-2">
      <NativeChatNoticeRow block={block} messageId="first-denial" />
      <NativeChatNoticeRow block={block} messageId="second-denial" />
    </div>
  )
})
export const expandedClassifierDenial = defineFixture({
  width: 640,
  render: () => (
    <div className="native-chat-appearance">
      <NativeChatNoticeRow block={block} />
    </div>
  ),
  interact: (frame) => {
    frame.querySelector<HTMLButtonElement>('button')?.click()
  }
})
