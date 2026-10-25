import { Pressable, Text, View } from 'react-native'
import { AlertCircle, AlertTriangle, Check, ChevronRight } from 'lucide-react-native'
import {
  nativeChatAutoApprovalOutcome,
  type NativeChatAutoApprovalOutcome
} from '../../../src/shared/native-chat-auto-approval'
import { NATIVE_CHAT_NOTICE_COPY } from '../../../src/shared/native-chat-notice'
import type { NativeChatTextBlock } from '../../../src/shared/native-chat-types'
import { INLINE_TEXT_SELECTION } from '../components/inline-text-selection'
import { colors } from '../theme/mobile-theme'
import { useMobileNativeChatDisclosure } from './mobile-native-chat-disclosure-store'
import { toolStyles as styles, toolType } from './mobile-native-chat-tool-styles'
import { MobileNativeChatToolOutput } from './MobileNativeChatFullContent'

const OUTCOME_COPY: Record<NativeChatAutoApprovalOutcome, string> = {
  approved: NATIVE_CHAT_NOTICE_COPY.autoApprovalGranted,
  rejected: NATIVE_CHAT_NOTICE_COPY.autoApprovalRejected,
  denied: NATIVE_CHAT_NOTICE_COPY.autoApprovalDenied,
  'timed-out': NATIVE_CHAT_NOTICE_COPY.autoApprovalTimedOut,
  'safety-denied': NATIVE_CHAT_NOTICE_COPY.safetyCheckDenied
}

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
  const outcome = nativeChatAutoApprovalOutcome(block) ?? 'approved'
  const Icon =
    outcome === 'approved' ? Check : outcome === 'timed-out' ? AlertCircle : AlertTriangle
  const color = outcome === 'approved' ? colors.textMuted : colors.statusAmber
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
          <Icon size={14 * fontScale} color={color} />
          <Text style={[styles.headerSentence, type.row, { color }]} numberOfLines={1}>
            {OUTCOME_COPY[outcome]}
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
