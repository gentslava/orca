// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DraftStore from './native-chat-composer-draft-store'
import type { QueuedEditImageState } from './structured-agent-session-queued-edit-images'
import type { AgentJournalMessageItem } from '../../../../shared/agent-session-journal-types'
import {
  createMemoryNativeChatComposerDraftStorage,
  type NativeChatComposerDraftStorage
} from './native-chat-composer-draft-storage'

const SCOPE = 'agent-session:recovery'
const TEXT = 'typed [Image](orca-image:literal) [Image #1] [Image #2]'
let storage: ReturnType<typeof createMemoryNativeChatComposerDraftStorage>
const loaded: (typeof DraftStore)[] = []

async function reload(using: NativeChatComposerDraftStorage = storage, hydrate = true) {
  vi.resetModules()
  const storageModule = await import('./native-chat-composer-draft-storage')
  storageModule.setNativeChatComposerDraftStorageForTests(using)
  const store = await import('./native-chat-composer-draft-store')
  loaded.push(store)
  if (hydrate) {
    await store.hydrateNativeChatComposerDrafts()
  }
  return store
}

beforeEach(() => {
  localStorage.clear()
  storage = createMemoryNativeChatComposerDraftStorage()
})

afterEach(() => {
  for (const store of loaded.splice(0)) {
    store.clearNativeChatComposerDraftsForTests()
  }
})

describe('composer recovery across reloads', () => {
  describe.each(['committed draft', 'unconfirmed addition', 'before hydration'] as const)(
    '%s',
    (durability) => {
      it.each(['returned message', 'queued edit'] as const)(
        'preserves literal text and ordered remote attachments from a %s',
        async (source) => {
          let land: (() => void) | undefined
          const store = await reload(
            durability === 'unconfirmed addition'
              ? { ...storage, write: () => new Promise<void>(() => {}) }
              : durability === 'before hydration'
                ? {
                    ...storage,
                    loadAll: () => {
                      const snapshot = new Map(storage.drafts)
                      return new Promise<ReadonlyMap<string, unknown>>((resolve) => {
                        land = () => resolve(snapshot)
                      })
                    }
                  }
                : storage,
            durability !== 'before hydration'
          )
          const hydrating = store.hydrateNativeChatComposerDrafts()
          if (source === 'returned message') {
            const { returnMessageToComposer } =
              await import('./structured-agent-session-message-hand-back')
            expect(
              returnMessageToComposer(
                SCOPE,
                'returned',
                [
                  { type: 'text', text: TEXT },
                  { type: 'image-ref', path: '/remote/a.png' },
                  { type: 'image-ref', path: '/remote/b.png' }
                ],
                ['ssh-a', 'ssh-b']
              )
            ).toBe(true)
          } else {
            const { handOffQueuedEdit, queuedEditImageFields } =
              await import('./structured-agent-session-queued-edit-images')
            const body: AgentJournalMessageItem = {
              kind: 'message',
              role: 'user',
              blocks: [{ type: 'text', text: 'original queued text' }]
            }
            const edit: QueuedEditImageState = {
              draftKey: SCOPE,
              body,
              text: TEXT,
              ...queuedEditImageFields(
                body,
                () => edit,
                () => true,
                () => {}
              )
            }
            edit.intake.append(['/remote/a.png'], 'ssh-a')
            edit.intake.append(['/remote/b.png'], 'ssh-b')
            edit.intake.begin()
            expect(handOffQueuedEdit(edit)).toBe(true)
          }
          const before = store.readNativeChatComposerDraft(SCOPE)
          expect(before.text).toBe(TEXT)
          expect(before.document).toBeUndefined()
          expect(before.images).toEqual([
            expect.objectContaining({ path: '/remote/a.png', connectionId: 'ssh-a' }),
            expect.objectContaining({ path: '/remote/b.png', connectionId: 'ssh-b' })
          ])
          if (durability !== 'unconfirmed addition') {
            land?.()
            await hydrating
            store.flushNativeChatComposerDrafts()
            await store.nativeChatComposerDraftWritesSettled()
            expect(storage.drafts.get(SCOPE)?.text).toBe(TEXT)
          } else {
            expect(storage.drafts.size).toBe(0)
          }
          store.clearNativeChatComposerDraftsForTests()

          const reloaded = await reload()
          expect(reloaded.readNativeChatComposerDraft(SCOPE)).toMatchObject({
            text: TEXT,
            images: before.images
          })
          await reloaded.nativeChatComposerDraftWritesSettled()
          reloaded.clearNativeChatComposerDraftsForTests()
          expect((await reload()).readNativeChatComposerDraft(SCOPE)).toMatchObject({
            text: TEXT,
            images: before.images
          })
        }
      )
    }
  )

  it('preserves documentless typing journaled at pagehide', async () => {
    const store = await reload({ ...storage, write: () => new Promise<void>(() => {}) })
    const { writeNativeChatDraftCache } = await import('./native-chat-draft-cache')
    writeNativeChatDraftCache(SCOPE, TEXT)
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.drafts.size).toBe(0)
    store.clearNativeChatComposerDraftsForTests()

    expect((await reload()).readNativeChatComposerDraft(SCOPE).text).toBe(TEXT)
  })

  it('migrates unmarked legacy documentless drafts and additions while keeping remote images', async () => {
    const images = [{ id: 'old', path: '/remote/old.png', connectionId: 'ssh-old' }]
    storage.drafts.set(SCOPE, {
      text: '[Image](orca-image:old) earlier [Image #1]',
      images,
      savedAt: 1
    })
    localStorage.setItem(
      'orca:nativeChatComposerDraftJournal:v1',
      JSON.stringify([
        {
          scopeKey: SCOPE,
          at: 2,
          addition: { text: 'returned [Image](orca-image:gone) [Image #2]' }
        }
      ])
    )
    const store = await reload()
    expect(store.readNativeChatComposerDraft(SCOPE)).toMatchObject({
      text: 'earlier [Image #1]\n\nreturned [Image #2]',
      images
    })
    await store.nativeChatComposerDraftWritesSettled()
    store.clearNativeChatComposerDraftsForTests()
    expect((await reload()).readNativeChatComposerDraft(SCOPE)).toMatchObject({
      text: 'earlier [Image #1]\n\nreturned [Image #2]',
      images
    })
  })
})
