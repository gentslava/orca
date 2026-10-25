import type { NativeChatComposerInput } from './native-chat-composer-input'
import { useCallback, useEffect, useLayoutEffect, useMemo, type RefObject } from 'react'
import {
  nativeChatComposerTargetIsRemote,
  nativeChatLocalAttachmentUnsupportedNotice,
  type NativeChatResolvedTarget
} from './native-chat-composer-target'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'
import {
  readNativeChatComposerDraft,
  updateNativeChatComposerDraft
} from './native-chat-composer-draft-store'
import type { NativeChatResolvedPathOptions } from './native-chat-resolved-path-ownership'
import { useNativeChatResolvedPathAttachments } from './use-native-chat-resolved-path-attachments'
import type {
  NativeChatPendingAttachmentChips,
  NativeChatPendingAttachmentOptions
} from './native-chat-session-attachment-drop'
import {
  addNativeChatPendingAttachment,
  appendNativeChatAttachmentsAfterPending,
  clearNativeChatPendingAttachments,
  settleNativeChatPendingAttachment,
  settleNativeChatPendingAttachmentReferences,
  nativeChatPendingAttachmentSnapshot,
  takeNativeChatPendingAttachment
} from './native-chat-pending-attachment-cache'
import { useNativeChatComposerImageChips } from './use-native-chat-composer-image-chips'
import { createUuidV4 } from '../../../../shared/uuid-v4'
import { useNativeChatPastedTextAdmission } from './native-chat-pasted-text-state'

export type UseNativeChatComposerAttachmentsArgs = {
  attachmentScopeKey: string
  /** False when the agent takes no image input; see `useNativeChatResolvedPathAttachments`. */
  acceptsImages?: boolean
  allowWithoutTarget?: boolean
  caret: number
  disabled: boolean
  isComposing: () => boolean
  resolveTarget: () => NativeChatResolvedTarget | null
  textareaRef: RefObject<NativeChatComposerInput | null>
  setCaret: (caret: number) => void
  setDraft: (updater: (previous: string) => string) => void
  setNotice: (notice: string | null) => void
}

export function useNativeChatComposerAttachments({
  attachmentScopeKey,
  acceptsImages = true,
  allowWithoutTarget = false,
  caret,
  disabled,
  isComposing,
  resolveTarget,
  textareaRef,
  setCaret,
  setDraft,
  setNotice
}: UseNativeChatComposerAttachmentsArgs): {
  imageAttachments: NativeChatComposerImageAttachment[]
  /** A long paste in this scope is still being saved as a file; Send waits for it. */
  pastedTextSaving: boolean
  attachResolvedPaths: (
    paths: string[],
    connectionId?: string | null,
    options?: NativeChatResolvedPathOptions
  ) => void
  clearImageAttachments: () => void
  flushPendingAttachments: () => void
  removeImageAttachment: (id: string) => void
  /** `serverOwned`: an image the paste saved on the remote target's own server, not a client file. */
  beginPendingImageAttachment: (
    previewUrl?: string,
    pendingName?: string,
    serverOwned?: boolean
  ) => string | null
  resolvePendingImageAttachment: NativeChatPendingAttachmentChips['resolve']
  revealPendingImageAttachment: (id: string, previewUrl?: string) => void
  dropPendingImageAttachment: (id: string) => boolean
  pendingChips: NativeChatPendingAttachmentChips
  /** The editor while it shows this scope; null once it went or shows another. */
  scopeEditor: () => NativeChatComposerInput | null
} {
  const { imageAttachments, setPreview, releasePreview, releaseAllPreviews } =
    useNativeChatComposerImageChips(attachmentScopeKey)
  const mountedRef = useMemo(
    () => ({ scopeKey: attachmentScopeKey, current: true, acceptsImages: true }),
    [attachmentScopeKey]
  )
  // Captured callbacks retain this scope's last committed capability after unmount.
  useLayoutEffect(() => {
    mountedRef.acceptsImages = acceptsImages
  }, [acceptsImages, mountedRef])
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [mountedRef])

  const nextAttachmentId = useCallback(() => createUuidV4(), [])
  const serverOwnedPendingIds = useMemo(() => new Set<string>(), [])

  // Client-local paths cannot cross into a runtime target; workspace-owned
  // paths may only bypass this after the internal drop ownership gate.
  const attachmentTargetBlocked = useCallback(
    (targetOwned = false): boolean => {
      const target = resolveTarget()
      return (
        (!target && !allowWithoutTarget) ||
        Boolean(target && nativeChatComposerTargetIsRemote(target.ptyId) && !targetOwned)
      )
    },
    [allowWithoutTarget, resolveTarget]
  )

  const noteAttachmentTargetBlocked = useCallback(() => {
    setNotice(nativeChatLocalAttachmentUnsupportedNotice())
  }, [setNotice])

  // Pasted-text operations may outlive the editor that began them.
  const scopeEditor = useCallback(
    () => (mountedRef.current ? textareaRef.current : null),
    [mountedRef, textareaRef]
  )
  useLayoutEffect(() => {
    if (disabled) {
      clearNativeChatPendingAttachments(attachmentScopeKey)
    }
  }, [attachmentScopeKey, disabled])

  const appendImageAttachments = useCallback(
    (paths: { path: string; connectionId?: string | null }[]) => {
      const images = paths.map(({ path, connectionId }) => ({
        id: nextAttachmentId(),
        path,
        ...(connectionId ? { connectionId } : {})
      }))
      appendNativeChatAttachmentsAfterPending(attachmentScopeKey, images, { fromUser: true })
    },
    [attachmentScopeKey, nextAttachmentId]
  )

  const { attachResolvedPaths, disabledRef, flushPendingAttachments } =
    useNativeChatResolvedPathAttachments({
      acceptsImages,
      appendImageAttachments,
      attachmentTargetBlocked,
      caret,
      disabled,
      isComposing,
      mountedRef,
      noteAttachmentTargetBlocked,
      setCaret,
      setDraft,
      setNotice,
      textareaRef
    })

  // Placeholder chip shown the instant a paste starts, so a clipboard image that
  // takes a beat to save (or upload over SSH) never reads as a dropped paste.
  const beginPendingImageAttachment = useCallback(
    (previewUrl?: string, pendingName?: string, serverOwned = false): string | null => {
      if (disabledRef.current) {
        return null
      }
      if (attachmentTargetBlocked(serverOwned)) {
        noteAttachmentTargetBlocked()
        return null
      }
      const id = nextAttachmentId()
      if (serverOwned) {
        serverOwnedPendingIds.add(id)
      }
      addNativeChatPendingAttachment(attachmentScopeKey, {
        id,
        path: '',
        pending: true,
        ...(pendingName ? { pendingName } : {})
      })
      setPreview(id, previewUrl)
      return id
    },
    [
      attachmentScopeKey,
      attachmentTargetBlocked,
      disabledRef,
      nextAttachmentId,
      noteAttachmentTargetBlocked,
      serverOwnedPendingIds,
      setPreview
    ]
  )

  const attachPendingReferences = useCallback(
    (
      references: { id: string; path: string }[],
      options?: NativeChatPendingAttachmentOptions,
      serverOwned = false
    ) =>
      settleNativeChatPendingAttachmentReferences(
        attachmentScopeKey,
        references,
        options?.insertReferences !== undefined
          ? (options.insertReferences ?? undefined)
          : mountedRef.current && !disabledRef.current && !isComposing()
            ? (paths) =>
                // The paste re-checked the owner just before settling a server-owned image.
                attachResolvedPaths(
                  paths,
                  null,
                  serverOwned ? { ...options, targetOwnerIsCurrent: () => true } : options
                )
            : undefined
      ),
    [attachResolvedPaths, attachmentScopeKey, disabledRef, isComposing, mountedRef]
  )

  const resolvePendingImageAttachment = useCallback(
    (
      id: string,
      path: string,
      connectionId?: string | null,
      options?: NativeChatPendingAttachmentOptions
    ) => {
      const serverOwned = serverOwnedPendingIds.delete(id)
      return mountedRef.acceptsImages
        ? settleNativeChatPendingAttachment(attachmentScopeKey, id, path, connectionId)
        : attachPendingReferences([{ id, path }], options, serverOwned)
    },
    [attachPendingReferences, attachmentScopeKey, mountedRef, serverOwnedPendingIds]
  )

  const revealPendingImageAttachment = useCallback(
    (id: string, previewUrl?: string) => {
      if (nativeChatPendingAttachmentSnapshot(attachmentScopeKey).some((chip) => chip.id === id)) {
        setPreview(id, previewUrl)
      }
    },
    [attachmentScopeKey, setPreview]
  )

  // A pending chip was never saved, so dropping one, even late from a replaced composer, leaves
  // the draft alone.
  const dropPendingImageAttachment = useCallback(
    (id: string): boolean => {
      releasePreview(id)
      serverOwnedPendingIds.delete(id)
      return takeNativeChatPendingAttachment(attachmentScopeKey, id) !== undefined
    },
    [attachmentScopeKey, releasePreview, serverOwnedPendingIds]
  )

  const pendingChips = useMemo(
    (): NativeChatPendingAttachmentChips => ({
      begin: beginPendingImageAttachment,
      resolve: resolvePendingImageAttachment,
      drop: dropPendingImageAttachment,
      // Non-image files retain their inline reference semantics.
      attachReferences: attachPendingReferences
    }),
    [
      attachPendingReferences,
      beginPendingImageAttachment,
      dropPendingImageAttachment,
      resolvePendingImageAttachment
    ]
  )

  const pastedTextSaving = useNativeChatPastedTextAdmission(attachmentScopeKey) === 'saving'

  return {
    pendingChips,
    scopeEditor,
    imageAttachments,
    pastedTextSaving,
    attachResolvedPaths,
    clearImageAttachments: () => {
      releaseAllPreviews()
      clearNativeChatPendingAttachments(attachmentScopeKey)
      updateNativeChatComposerDraft(attachmentScopeKey, { images: [] }, 'immediate')
    },
    flushPendingAttachments,
    removeImageAttachment: (id) => {
      releasePreview(id)
      takeNativeChatPendingAttachment(attachmentScopeKey, id)
      const images = readNativeChatComposerDraft(attachmentScopeKey).images.filter(
        (image) => image.id !== id
      )
      updateNativeChatComposerDraft(attachmentScopeKey, { images }, 'immediate')
    },
    beginPendingImageAttachment,
    resolvePendingImageAttachment,
    revealPendingImageAttachment,
    dropPendingImageAttachment
  }
}

export {
  readNativeChatAttachmentCache,
  appendNativeChatAttachmentCache,
  clearNativeChatAttachmentCacheForTests
} from './native-chat-draft-cache'
