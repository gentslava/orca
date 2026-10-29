import { useMobileTranslation } from '../../../i18n/use-mobile-translation'
import { Pressable, Text, View } from 'react-native'
import { AlertCircle, AlertTriangle, Check, ChevronRight } from 'lucide-react-native'
import {
  nativeChatAutoApprovalOutcome,
  type NativeChatAutoApprovalOutcome
} from '../../../../../src/shared/native-chat-auto-approval'
import { NATIVE_CHAT_NOTICE_COPY } from '../../../../../src/shared/native-chat/native-chat-notice'
import type { NativeChatTextBlock } from '../../../../../src/shared/native-chat-types'
import { INLINE_TEXT_SELECTION } from '../../../components/inline-text-selection'
import { colors } from '../../../theme/mobile-theme'
import { useMobileNativeChatDisclosure } from './mobile-native-chat-disclosure-store'
import { toolStyles as styles, toolType } from './mobile-native-chat-tool-styles'
import { MobileNativeChatToolOutput } from '../../MobileNativeChatFullContent'

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
  const t = useMobileTranslation()
  const copy: Record<NativeChatAutoApprovalOutcome, string> = {
    approved: t('chat.notice.autoApprovalGranted', NATIVE_CHAT_NOTICE_COPY.autoApprovalGranted),
    rejected: t('chat.notice.autoApprovalRejected', NATIVE_CHAT_NOTICE_COPY.autoApprovalRejected),
    denied: t('chat.notice.autoApprovalDenied', NATIVE_CHAT_NOTICE_COPY.autoApprovalDenied),
    'timed-out': t(
      'chat.notice.autoApprovalTimedOut',
      NATIVE_CHAT_NOTICE_COPY.autoApprovalTimedOut
    ),
    'safety-denied': t('chat.notice.safetyCheckDenied', NATIVE_CHAT_NOTICE_COPY.safetyCheckDenied)
  }
  const [open, setOpen] = useMobileNativeChatDisclosure(
    messageId === undefined ? undefined : `auto-approval:${messageId}`,
    false
  )
  const type = toolType(fontScale)
  const outcome = nativeChatAutoApprovalOutcome(block) ?? 'approved'
  const Icon =
    outcome === 'approved' ? Check : outcome === 'timed-out' ? AlertCircle : AlertTriangle
  return (
    <View>
      {disclosed ? null : (
        <Pressable
          style={styles.header}
          accessibilityRole="button"
          aria-expanded={open}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
        >
          <Icon size={14 * fontScale} color={colors.textMuted} />
          <Text style={[styles.headerSentence, type.row]} numberOfLines={1}>
            {copy[outcome]}
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
          <Text
            selectable={INLINE_TEXT_SELECTION}
            style={[styles.headerSentence, type.row, block.tone === 'error' && styles.errorText]}
          >
            {block.text}
          </Text>
          {block.providerFrame ? (
            <MobileNativeChatToolOutput
              body={{
                type: 'tool-result',
                output: block.providerFrame.payload.head,
                isError: block.tone === 'error'
              }}
              inlinePayload={block.providerFrame.payload}
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
