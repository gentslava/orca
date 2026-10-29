import { useMobileTranslation } from '../../../i18n/use-mobile-translation'
import { Pressable, Text, View } from 'react-native'
import { AlertCircle, ChevronRight } from 'lucide-react-native'
import { readWholeAgentSessionFailureFact } from '../../../../../src/shared/agent-session-failure'
import { NATIVE_CHAT_NOTICE_COPY } from '../../../../../src/shared/native-chat/native-chat-notice'
import type { NativeChatTextBlock } from '../../../../../src/shared/native-chat-types'
import { INLINE_TEXT_SELECTION } from '../../../components/inline-text-selection'
import { colors } from '../../../theme/mobile-theme'
import { useMobileNativeChatDisclosure } from './mobile-native-chat-disclosure-store'
import { toolStyles as styles, toolType } from './mobile-native-chat-tool-styles'
import { MobileNativeChatToolOutput } from '../../MobileNativeChatFullContent'

export function MobileNativeChatErrorNotice({
  block,
  messageId,
  fontScale
}: {
  block: NativeChatTextBlock
  messageId?: string
  fontScale: number
}) {
  const t = useMobileTranslation()
  const [open, setOpen] = useMobileNativeChatDisclosure(
    messageId === undefined ? undefined : `error-notice:${messageId}`,
    false
  )
  const type = toolType(fontScale)
  const detail = readWholeAgentSessionFailureFact(block.failure)?.detail
  return (
    <View>
      <Pressable
        style={styles.header}
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <AlertCircle size={14 * fontScale} color={colors.textMuted} />
        <Text style={[styles.headerSentence, type.row]} numberOfLines={1}>
          {t('chat.notice.agentError', NATIVE_CHAT_NOTICE_COPY.agentError)}
        </Text>
        <ChevronRight
          size={14 * fontScale}
          color={colors.textMuted}
          style={open && styles.caretOpen}
        />
      </Pressable>
      {open ? (
        <View style={styles.taskCard}>
          <Text
            selectable={INLINE_TEXT_SELECTION}
            style={[styles.headerSentence, type.row, styles.errorText]}
          >
            {block.text}
          </Text>
          {detail?.audience === 'person' && detail.text !== block.text ? (
            <Text
              selectable={INLINE_TEXT_SELECTION}
              style={[styles.headerSentence, type.row, styles.errorText]}
            >
              {detail.text}
            </Text>
          ) : null}
          {block.providerFrame ? (
            <MobileNativeChatToolOutput
              body={{
                type: 'tool-result',
                output: block.providerFrame.payload.head,
                isError: true
              }}
              inlinePayload={block.providerFrame.payload}
              type={type.code}
              rootIdentity={`error-notice:${messageId ?? block.providerFrame.payload.digest}`}
              positionKey={`error-notice:${messageId ?? block.providerFrame.payload.digest}:payload`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
