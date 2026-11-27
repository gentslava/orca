import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { RepoIcon } from '../../../../../../shared/repository/appearance/repo-icon'
import {
  faviconUrlFromWebsite,
  MAX_REPO_ICON_UPLOAD_BYTES
} from '../../../../../../shared/repository/appearance/repo-icon'
import { CLIPBOARD_IMAGE_TOO_LARGE_ERROR } from '../../../../../../shared/clipboard/clipboard-image'
import { blobToBase64, convertImageBlobToPng } from '@/lib/clipboard/images/image-blob-png'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useTranslate } from '@/i18n/use-translate'
import { repoIconPickFailureText } from './repo-icon-pick-failure-text'

async function pickRepositoryIconImage(
  isCurrent: () => boolean,
  onIcon: (icon: RepoIcon) => void,
  onError: (error: unknown) => void,
  onSettled: () => void
): Promise<void> {
  try {
    const result = await window.api.shell.pickRepoIconImage()
    if (!result || !isCurrent()) {
      return
    }
    if ('error' in result) {
      toast.error(repoIconPickFailureText(result))
      return
    }
    const source = await (await fetch(result.dataUrl)).blob()
    const png = await convertImageBlobToPng(source, { maxEdge: 128 })
    if (png.size > MAX_REPO_ICON_UPLOAD_BYTES) {
      throw new Error('Repo icon image is too large.')
    }
    const dataUrl = `data:image/png;base64,${await blobToBase64(png)}`
    if (isCurrent()) {
      onIcon({ type: 'image', src: dataUrl, source: 'upload', label: result.fileName })
    }
  } catch (error) {
    if (isCurrent()) {
      onError(error)
    }
  } finally {
    if (isCurrent()) {
      onSettled()
    }
  }
}

/** Image-sourced repo icons (uploaded PNG, website favicon), shared by Settings and the project card. */
export function useRepositoryIconImagePicks(onSetIcon: (repoIcon: RepoIcon | null) => void): {
  uploadImage: () => Promise<void>
  cancelUpload: () => void
  uploading: boolean
  showUploadSpinner: boolean
  /** Returns whether the URL resolved to a favicon. */
  applyWebsiteFavicon: (website: string) => boolean
} {
  const t = useTranslate()
  const mountedRef = useMountedRef()

  const uploadRequest = useRef<symbol | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showUploadSpinner, setShowUploadSpinner] = useState(false)

  useEffect(() => {
    if (!uploading) {
      setShowUploadSpinner(false)
      return
    }
    const timer = setTimeout(() => setShowUploadSpinner(true), 200)
    return () => clearTimeout(timer)
  }, [uploading])

  const cancelUpload = (): void => {
    uploadRequest.current = null
    setUploading(false)
  }

  const uploadImage = async (): Promise<void> => {
    if (uploadRequest.current) {
      return
    }
    const request = Symbol()
    uploadRequest.current = request
    setUploading(true)
    return pickRepositoryIconImage(
      () => mountedRef.current && uploadRequest.current === request,
      onSetIcon,
      (error) => {
        toast.error(
          error instanceof Error
            ? error.message === CLIPBOARD_IMAGE_TOO_LARGE_ERROR ||
              error.message.endsWith('Repo icon image must be 10MB or smaller.')
              ? t(
                  'auto.components.settings.RepositoryIconPicker.imageTooLarge',
                  'Image exceeds the 10MB or 32-megapixel limit.'
                )
              : error.message
            : t(
                'auto.components.settings.RepositoryIconPicker.868c5c9b56',
                'Failed to import repo icon'
              )
        )
      },
      cancelUpload
    )
  }

  const applyWebsiteFavicon = (website: string): boolean => {
    const src = faviconUrlFromWebsite(website)
    if (!src) {
      toast.error(
        t('auto.components.settings.RepositoryIconPicker.acf31559a0', 'Enter a valid website URL.')
      )
      return false
    }
    cancelUpload()
    onSetIcon({
      type: 'image',
      src,
      source: 'favicon',
      label: t('auto.components.settings.RepositoryIconPicker.4d039317f4', 'Website favicon')
    })
    return true
  }

  return { uploadImage, applyWebsiteFavicon, cancelUpload, uploading, showUploadSpinner }
}
