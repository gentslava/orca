import { useContext, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from 'react-native'
import type { NativeChatImageRefBlock } from '../../../src/shared/native-chat-types'
import { isAgentSessionAttachmentStorePath } from '../../../src/shared/agent-session-attachments'
import { MobileNativeChatRowOverlaysContext } from './mobile-native-chat-row-overlays'
import { isRenderableImageUri, readMobileNativeChatImage } from './mobile-native-chat-image-preview'
import { styles, TEXT_SIZE } from './mobile-native-chat-message-styles'

export function MobileNativeChatImageAttachment({
  block,
  fontScale,
  onLongPress
}: {
  block: NativeChatImageRefBlock
  fontScale: number
  onLongPress?: () => void
}): React.JSX.Element {
  const { openImage, imageSource } = useContext(MobileNativeChatRowOverlaysContext)
  const client = imageSource?.client
  const sessionId = imageSource?.sessionId
  const generation = client?.getGeneration?.() ?? 0
  const path = block.path
  const directUri = isRenderableImageUri(block.url)
    ? block.url
    : isRenderableImageUri(path)
      ? path
      : null
  const readable = !!client && !!path && isAgentSessionAttachmentStorePath(path)
  const [round, setRound] = useState(0)
  const [showSpinner, setShowSpinner] = useState(false)
  const owner = useMemo(
    () => ({ client, sessionId, generation, path, directUri, round }),
    [client, sessionId, generation, path, directUri, round]
  )
  const [failedOwner, setFailedOwner] = useState<typeof owner | null>(null)
  const [preview, setPreview] = useState<{
    owner: typeof owner
    uri: string | null
  } | null>(null)
  const current = preview?.owner === owner ? preview : null

  useEffect(() => {
    if (directUri || !client || !path || !isAgentSessionAttachmentStorePath(path)) {
      return
    }
    let disposed = false
    setShowSpinner(false)
    const timer = setTimeout(() => {
      if (!disposed) {
        setShowSpinner(true)
      }
    }, 200)
    void readMobileNativeChatImage(client, path).then((uri) => {
      clearTimeout(timer)
      if (!disposed && (client.getGeneration?.() ?? 0) === generation) {
        setPreview({ owner, uri })
      }
    })
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [client, generation, path, directUri, owner])

  const uri = directUri ?? current?.uri
  const label = block.alt ?? 'Attached image'
  if (uri && failedOwner !== owner) {
    return (
      <Pressable
        onPress={() => openImage({ uri, label })}
        onLongPress={onLongPress}
        accessibilityRole={Platform.OS === 'web' ? 'button' : 'imagebutton'}
        accessibilityLabel={label}
        accessibilityHint="Opens the image full size"
      >
        <Image
          source={{ uri }}
          style={styles.imageThumb}
          resizeMode="contain"
          onError={() => setFailedOwner(owner)}
        />
      </Pressable>
    )
  }
  if (readable && !current && !directUri) {
    return (
      <View style={[styles.imageThumb, styles.imageLoading]} accessibilityLabel="Loading image">
        {showSpinner ? <ActivityIndicator /> : null}
      </View>
    )
  }
  if (readable || directUri) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Image unavailable"
        accessibilityHint="Tries to load it again"
        onPress={() => {
          setRound((value) => value + 1)
        }}
      >
        <Text style={[styles.imageRef, { fontSize: TEXT_SIZE * fontScale }]}>
          Image unavailable — tap to retry
        </Text>
      </Pressable>
    )
  }
  return (
    <Text style={[styles.imageRef, { fontSize: TEXT_SIZE * fontScale }]}>
      🖼 {block.alt ?? block.path ?? block.url ?? 'image'}
    </Text>
  )
}
