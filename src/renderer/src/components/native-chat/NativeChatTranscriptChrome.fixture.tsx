import { useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { NativeChatImageAttachments } from './NativeChatTranscriptChrome'
import { NativeChatBackgroundTasksStatus } from './NativeChatBackgroundTasksStatus'

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='

function ImageTranscript(): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="native-chat-appearance flex h-[32rem] flex-col bg-chat-canvas text-chat-foreground">
      <div
        data-image-transcript-scroll
        className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
      >
        <div className="h-64" />
        <div
          data-image-message
          className="ml-auto max-w-[80%] rounded-xl border border-chat-user-border bg-chat-user-surface px-3.5 py-2.5"
        >
          <NativeChatImageAttachments
            blocks={Array.from({ length: 8 }, (_, i) => ({
              type: 'image-ref',
              url: image,
              alt: `Screenshot ${i + 1}`
            }))}
            runtimeContext={null}
          />
          <p>Compare these screenshots and explain the changes.</p>
        </div>
        <div className="h-[80rem] p-4">The reply below the images must stay still.</div>
      </div>
      <NativeChatBackgroundTasksStatus
        tasks={[
          { id: 'child-1', kind: 'agent', description: 'Review screenshots' },
          { id: 'child-2', kind: 'agent', description: 'Inspect layout' },
          { id: 'child-3', kind: 'agent', description: 'Check scroll position' }
        ]}
        settledTasks={[]}
        supportsTaskStop={false}
        offersStopAll={false}
        stoppingTaskIds={new Set()}
        stoppingAll={false}
        indicatorActive={false}
        isVisible
        expanded={expanded}
        onExpandedChange={setExpanded}
        onStop={() => {}}
      />
    </div>
  )
}

const paint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

export const imageVisibility = defineFixture({
  width: 800,
  render: () => <ImageTranscript />,
  interact: async (frame) => {
    const scroller = frame.querySelector<HTMLElement>('[data-image-transcript-scroll]')
    const message = frame.querySelector<HTMLElement>('[data-image-message]')
    const toggle = frame.querySelector<HTMLButtonElement>(
      '[data-native-chat-background-tasks] button[aria-expanded]'
    )
    if (!scroller || !message || !toggle) {
      throw new Error('Image transcript fixture did not mount')
    }
    await paint()
    const initialHeight = message.getBoundingClientRect().height
    if (message.querySelectorAll('img').length !== 8) {
      throw new Error('Nearby thumbnails did not load')
    }
    toggle.click()
    await paint()
    for (const top of [600, 0, 600, 0]) {
      scroller.scrollTop = top
      await paint()
      await paint()
      const height = message.getBoundingClientRect().height
      if (Math.abs(height - initialHeight) > 1) {
        throw new Error(`Visibility changed message height from ${initialHeight} to ${height}`)
      }
      if (message.querySelectorAll('img').length !== (top === 0 ? 8 : 0)) {
        throw new Error('Offscreen image pixels must unload and load again on return')
      }
    }
  }
})
