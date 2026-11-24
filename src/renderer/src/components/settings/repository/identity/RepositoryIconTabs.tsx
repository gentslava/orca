import { Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Github, Image, Link2 } from 'lucide-react'
import type { RepoIcon } from '../../../../../../shared/repository/appearance/repo-icon'
import { Button } from '../../../ui/button'
import { LoadingSpinner } from '../../../ui/LoadingSpinner'
import { Input } from '../../../ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/tooltip'
import { getRepoLucideIconOptions } from '../../../repo/repo-icon'
import { useTranslate } from '@/i18n/use-translate'
import { lazyWithRetry } from '@/app-shell/startup/lazy-with-retry'
import { useRepositoryIconImagePicks } from './use-repository-icon-image-picks'

const RepositoryIconEmojiPicker = lazyWithRetry(
  () =>
    import('./RepositoryIconEmojiPicker').then((module) => ({
      default: module.RepositoryIconEmojiPicker
    })),
  { reloadKey: 'repo-icon-emoji-picker' }
)

export type RepositoryIconTabsHandle = {
  cancelUpload: () => void
}

type RepositoryIconTabsProps = {
  ref?: React.Ref<RepositoryIconTabsHandle>
  initialTab: 'letters' | 'avatar' | 'icon' | 'emoji'
  /** The monogram editor, shared with the sidebar project card. */
  lettersPanel: React.ReactNode
  selectedLucideName: string | null
  selectedEmoji: string
  loadingGitHub: boolean
  onSetIcon: (repoIcon: RepoIcon | null) => void
  onUseGitHubAvatar: () => void
}

export function RepositoryIconTabs({
  ref,
  initialTab,
  lettersPanel,
  selectedLucideName,
  selectedEmoji,
  loadingGitHub,
  onSetIcon,
  onUseGitHubAvatar
}: RepositoryIconTabsProps): React.JSX.Element {
  const t = useTranslate()
  const [website, setWebsite] = useState('')
  const uploadRequest = useRef<symbol | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showUploadSpinner, setShowUploadSpinner] = useState(false)
  const { uploadImage, applyWebsiteFavicon } = useRepositoryIconImagePicks(onSetIcon)

  useEffect(() => {
    if (!uploading) {
      setShowUploadSpinner(false)
      return
    }
    const timer = setTimeout(() => setShowUploadSpinner(true), 200)
    return () => clearTimeout(timer)
  }, [uploading])

  const cancelUpload = () => {
    uploadRequest.current = null
    setUploading(false)
  }
  useImperativeHandle(ref, () => ({ cancelUpload }))

  const handleSetIcon = (icon: RepoIcon | null) => {
    cancelUpload()
    onSetIcon(icon)
  }
  const handleUploadImage = async () => {
    if (uploadRequest.current) {
      return
    }
    const request = Symbol()
    uploadRequest.current = request
    setUploading(true)
    await uploadImage(() => uploadRequest.current === request)
    if (uploadRequest.current === request) {
      cancelUpload()
    }
  }
  const handleUseWebsiteFavicon = () => {
    cancelUpload()
    applyWebsiteFavicon(website)
  }

  return (
    <Tabs defaultValue={initialTab} className="gap-3">
      <TabsList variant="line" className="h-8">
        <TabsTrigger value="letters" className="h-7">
          {t('auto.components.repo.ProjectPeek.styleLetters', 'Letters')}
        </TabsTrigger>
        <TabsTrigger value="avatar" className="h-7 text-xs">
          {t('auto.components.settings.RepositoryIconPicker.2d8bd302fa', 'Avatar')}
        </TabsTrigger>
        <TabsTrigger value="icon" className="h-7 text-xs">
          {t('auto.components.settings.RepositoryIconPicker.b2d7fd2116', 'Icon')}
        </TabsTrigger>
        <TabsTrigger value="emoji" className="h-7 text-xs">
          {t('auto.components.settings.RepositoryIconPicker.c490787d24', 'Emoji')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="letters">{lettersPanel}</TabsContent>

      <TabsContent value="avatar" className="space-y-3">
        <Button
          type="button"
          variant="default"
          className="w-full gap-2"
          disabled={loadingGitHub}
          onClick={() => {
            cancelUpload()
            onUseGitHubAvatar()
          }}
        >
          <Github className="size-3.5" />
          {t('auto.components.settings.RepositoryIconPicker.cc76342291', 'Use GitHub avatar')}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t(
            'auto.components.settings.RepositoryIconPicker.7da623abcc',
            "Used by default — GitHub always provides one, even when the owner hasn't set a custom image."
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={uploading || loadingGitHub}
          aria-busy={uploading}
          onClick={() => void handleUploadImage()}
        >
          {uploading && showUploadSpinner ? (
            <LoadingSpinner className="size-3.5" />
          ) : (
            <Image className="size-3.5" />
          )}
          {t('auto.components.settings.RepositoryIconPicker.381b4844fd', 'Upload image')}
        </Button>
        <div className="flex gap-2">
          <Input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder={t(
              'auto.components.settings.RepositoryIconPicker.03ca1a4e9b',
              'example.com'
            )}
            className="h-9 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={handleUseWebsiteFavicon}
          >
            <Link2 className="size-3.5" />
            {t('auto.components.settings.RepositoryIconPicker.cc1286e263', 'Favicon')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'auto.components.settings.RepositoryIconPicker.fde066a63b',
            'PNG, JPEG, SVG, WebP, GIF, BMP, ICO or AVIF. Up to 10MB and 32 megapixels.'
          )}
        </p>
      </TabsContent>

      <TabsContent value="icon" className="space-y-3">
        <div className="grid grid-cols-10 gap-1.5">
          {getRepoLucideIconOptions().map((option) => (
            <Tooltip key={option.name}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={selectedLucideName === option.name ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  className="size-8"
                  onClick={() => handleSetIcon({ type: 'lucide', name: option.name })}
                  aria-label={t(
                    'auto.components.settings.RepositoryIconPicker.useRepoIcon',
                    'Use {{value0}} repo icon',
                    { value0: option.label }
                  )}
                >
                  <option.icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {option.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="emoji">
        <Suspense fallback={null}>
          <RepositoryIconEmojiPicker selectedEmoji={selectedEmoji} onSetIcon={handleSetIcon} />
        </Suspense>
      </TabsContent>
    </Tabs>
  )
}
