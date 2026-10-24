import { Pressable, Text, View } from 'react-native'
import { Check, ChevronRight } from 'lucide-react-native'
import { NATIVE_CHAT_NOTICE_COPY } from '../../../src/shared/native-chat-notice'
import type { NativeChatTextBlock } from '../../../src/shared/native-chat-types'
import { INLINE_TEXT_SELECTION } from '../components/inline-text-selection'
import { colors } from '../theme/mobile-theme'
import { useMobileNativeChatDisclosure } from './mobile-native-chat-disclosure-store'
import { toolStyles as styles, toolType } from './mobile-native-chat-tool-styles'
import { MobileNativeChatToolOutput } from './MobileNativeChatFullContent'

export function MobileNativeChatAutoApprovalNotice({
  block,
  messageId,
  disclosed = false,
  fontScale
}: {
  block: NativeChatTextBlock
  messageId?: string
  disclosed?: boolean
  fontScale: number
}): React.JSX.Element {
  const [open, setOpen] = useMobileNativeChatDisclosure(
    messageId === undefined ? undefined : `auto-approval:${messageId}`,
    false
  )
  const type = toolType(fontScale)
  return (
    <View>
      {disclosed ? null : (
        <Pressable
          style={styles.header}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
        >
          <Check size={14 * fontScale} color={colors.textMuted} />
          <Text style={[styles.headerSentence, type.row]} numberOfLines={1}>
            {NATIVE_CHAT_NOTICE_COPY.autoApprovalGranted}
          </Text>
          <ChevronRight
            size={14 * fontScale}
            color={colors.textMuted}
            style={open && styles.caretOpen}
          />
        </Pressable>
      )}
      {disclosed || open ? (
        <View style={styles.taskCard}>
          <Text selectable={INLINE_TEXT_SELECTION} style={[styles.headerSentence, type.row]}>
            {block.text}
          </Text>
          {block.providerFrame ? (
            <MobileNativeChatToolOutput
              body={{ type: 'tool-result', output: block.providerFrame.payload.head }}
              type={type.code}
              rootIdentity={`auto-approval:${messageId ?? block.providerFrame.payload.digest}`}
              positionKey={`auto-approval:${messageId ?? block.providerFrame.payload.digest}:payload`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
