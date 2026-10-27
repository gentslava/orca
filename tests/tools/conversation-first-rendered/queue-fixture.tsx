import { useRef, useState } from 'react'
import { NativeChatComposerField } from '@/components/native-chat/NativeChatComposerField'
import { NativeChatQueuedMessageList } from '@/components/native-chat/NativeChatQueuedMessageList'
import { useNativeChatComposerKeyDown } from '@/components/native-chat/use-native-chat-composer-keydown'
import { useImeEnterGestureOwnership } from '@/lib/ime-composition-keyboard-event'
import type { NativeChatComposerInput } from '@/components/native-chat/native-chat-composer-input'
import type { QueuedMessageCard } from '@/components/native-chat/structured-agent-session-queued-cards'
import type { StructuredAgentSessionQueuedMessagesController } from '@/components/native-chat/use-structured-agent-session-queued-messages'
import type {
  SessionOptionDescriptor,
  SessionOptionValue,
  SessionOptionsSurface
} from '../../../src/shared/native-chat/input/native-chat-session-options'

const noop = () => undefined
const initialOptions: SessionOptionDescriptor[] = [
  {
    id: 'model',
    label: 'Model',
    category: 'model',
    kind: {
      type: 'select',
      currentValue: 'research-model',
      choices: [
        { value: 'research-model', label: 'Research model' },
        { value: 'review-model', label: 'Review model' }
      ]
    },
    valueSource: 'applied',
    transport: 'agent-session',
    settable: true
  },
  {
    id: 'effort',
    label: 'Effort',
    category: 'thought_level',
    kind: {
      type: 'select',
      currentValue: 'high',
      choices: [
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' }
      ]
    },
    valueSource: 'applied',
    transport: 'agent-session',
    settable: true
  },
  {
    id: 'fastMode',
    label: 'Fast mode',
    category: 'mode',
    kind: { type: 'boolean', currentValue: false },
    valueSource: 'applied',
    transport: 'agent-session',
    settable: true
  }
]

export function QueueFixture() {
  const queueOnEnter = new URL(location.href).searchParams.get('enter') !== 'send'
  const [draft, setDraft] = useState('')
  const [cards, setCards] = useState<QueuedMessageCard[]>([])
  const [immediate, setImmediate] = useState('')
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null)
  const [snapshot, setSnapshot] = useState(initialOptions)
  const input = useRef<NativeChatComposerInput>(null)
  const sequence = useRef(0)
  const ime = useImeEnterGestureOwnership()
  const enqueue = () => {
    if (!draft.trim()) {
      return
    }
    sequence.current += 1
    const messageId = `fixture-draft-${sequence.current}`
    setCards((current) => [
      ...current,
      { messageId, text: draft, position: sequence.current, state: 'waiting', hold: 'turn' }
    ])
    setDraft('')
  }
  const steer = () => {
    if (draft.trim()) {
      setImmediate(draft)
      setDraft('')
    }
  }
  const remove = async (id: string) =>
    setCards((current) => current.filter((c) => c.messageId !== id))
  const controller: StructuredAgentSessionQueuedMessagesController = {
    cards,
    queueCapable: true,
    clearCapable: true,
    editCapable: true,
    pause: null,
    queuePending: null,
    pending: () => null,
    resume: async () => true,
    clear: async () => {
      setCards([])
      return true
    },
    remove,
    steer: async (id) => {
      setImmediate(cards.find((card) => card.messageId === id)?.text ?? '')
      await remove(id)
    },
    steerNewest: () => false,
    edit: async (id) => {
      const card = cards.find((candidate) => candidate.messageId === id)
      if (card) {
        setEdit({ id, text: card.text })
      }
    },
    editor: edit
      ? {
          messageId: edit.id,
          text: edit.text,
          acquiring: false,
          saving: false,
          canSave: edit.text.trim().length > 0,
          change: (text) => setEdit({ id: edit.id, text }),
          cancel: () => setEdit(null),
          save: () => {
            setCards((current) =>
              current.map((c) => (c.messageId === edit.id ? { ...c, text: edit.text } : c))
            )
            setEdit(null)
          }
        }
      : undefined,
    reorder: {
      scope: 'fixture',
      pending: false,
      move: async (id, anchor) => {
        setCards((current) => {
          const moving = current.find((c) => c.messageId === id)
          if (!moving) {
            return current
          }
          const remaining = current.filter((c) => c.messageId !== id)
          const anchorId = anchor.afterMessageId ?? anchor.beforeMessageId
          const index =
            anchorId == null
              ? remaining.length
              : remaining.findIndex((c) => c.messageId === anchorId)
          if (index < 0) {
            return current
          }
          remaining.splice(index + (anchor.afterMessageId ? 1 : 0), 0, moving)
          return remaining.map((c, i) => ({ ...c, position: i + 1 }))
        })
      }
    }
  }
  const surface: SessionOptionsSurface = {
    getSnapshot: () => snapshot,
    setOption: async (id, value: SessionOptionValue) => {
      const updated = snapshot.map((option): SessionOptionDescriptor => {
        if (option.id !== id) {
          return option
        }
        if (option.kind.type === 'select' && typeof value === 'string') {
          return { ...option, kind: { ...option.kind, currentValue: value } }
        }
        if (option.kind.type === 'boolean' && typeof value === 'boolean') {
          return { ...option, kind: { ...option.kind, currentValue: value } }
        }
        return option
      })
      setSnapshot(updated)
      return { snapshot: updated }
    },
    invokeAction: async () => ({ snapshot }),
    subscribe: () => noop
  }
  const keyDown = useNativeChatComposerKeyDown({
    autocomplete: { mode: 'none' },
    mentionFiles: { files: [], loading: false, failed: false },
    completeMention: noop,
    activeSuggestion: 0,
    draft,
    isComposing: ime.isComposing,
    completePickerItem: noop,
    dispatchPickerCommand: noop,
    dismissPicker: noop,
    interrupt: noop,
    send: queueOnEnter ? enqueue : steer,
    sendAlternate: queueOnEnter ? steer : enqueue,
    setActiveSuggestion: noop,
    setDraft,
    setCaret: noop
  })
  return (
    <div data-queue-fixture className="shrink-0">
      {immediate ? (
        <p data-immediate-message className="px-4 text-sm">
          Sent now: {immediate}
        </p>
      ) : null}
      <NativeChatQueuedMessageList
        controller={controller}
        chatWorktreeId={null}
        focusComposer={() => input.current?.focus()}
      />
      <NativeChatComposerField
        draftScopeKey="rendered-fixture"
        textareaRef={input}
        draft={draft}
        disabled={false}
        hasPty
        canSend
        autocomplete={{ mode: 'none' }}
        mentionFiles={{ files: [], loading: false, failed: false }}
        activeSuggestion={0}
        notices={[]}
        imageAttachments={[]}
        sendButtonDisabled={false}
        isWorking
        attachDisabled
        dictationDisabled
        isDictating={false}
        isDictationHoldMode={false}
        imeEnterGesture={ime}
        onDraftChange={setDraft}
        onTextareaSelect={noop}
        onKeyDown={keyDown}
        onImeSettled={(element) => setDraft(element.value)}
        onPaste={noop}
        pickerListboxId="fixture-picker"
        onChoosePickerItem={noop}
        onRetrySkills={noop}
        onChooseMentionFile={noop}
        onRemoveImageAttachment={noop}
        onAttach={noop}
        onDictationToggle={noop}
        onDictationHoldStart={noop}
        onDictationHoldEnd={noop}
        onSend={queueOnEnter ? enqueue : steer}
        onStop={noop}
        sessionOptionsSurface={surface}
        sessionOptionsSnapshot={snapshot}
      />
    </div>
  )
}
