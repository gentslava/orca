import { Pressable, Text, View } from 'react-native'
import type {
  ConversationPreference,
  ConversationPreferences
} from '../../../src/shared/conversation-navigation-preferences'
import { BottomDrawer } from '../components/BottomDrawer'
import type { ConversationRow } from './project-conversations'
import { conversationCopy } from './conversation-copy'
import { conversationStyles as styles } from './conversation-styles'

export function ConversationDetailsSheet({
  details,
  onClose,
  hostTitle,
  canManage,
  writing,
  preferences,
  onPreference,
  archived,
  connected
}: {
  details: ConversationRow | null
  onClose: () => void
  hostTitle: string
  canManage: boolean
  writing: boolean
  preferences: ConversationPreferences | undefined
  onPreference: (key: string, patch: ConversationPreference) => Promise<boolean>
  archived: boolean
  connected: boolean
}) {
  const copy = conversationCopy()
  return (
    <BottomDrawer visible={details !== null} onClose={() => onClose()}>
      {details && (
        <View style={styles.drawer}>
          <Text style={styles.title}>{details.title}</Text>
          <Text
            style={styles.detail}
            selectable
          >{`${copy.host}: ${details.workspace.hostContextLabel ?? hostTitle}\n${copy.workspace}: ${details.workspace.displayName}\n${details.workspace.path}${details.workspace.branch ? `\n${copy.branch}: ${details.workspace.branch}` : ''}${details.workspace.linkedPR ? `\nPR #${details.workspace.linkedPR.number}` : ''}${details.history?.model ? `\n${copy.model}: ${details.history.model}` : ''}`}</Text>
          {details.preferenceKey && canManage ? (
            <>
              <Pressable
                onPress={async () => {
                  if (
                    details.preferenceKey &&
                    (await onPreference(details.preferenceKey, {
                      pinned: !preferences?.entries[details.preferenceKey]?.pinned
                    }))
                  ) {
                    onClose()
                  }
                }}
                style={styles.agentButton}
                accessibilityRole="button"
                disabled={!connected || writing}
              >
                <Text style={styles.actionText}>
                  {preferences?.entries[details.preferenceKey]?.pinned
                    ? copy.unpinChat
                    : copy.pinChat}
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (
                    details.preferenceKey &&
                    (await onPreference(details.preferenceKey, {
                      archived: !archived
                    }))
                  ) {
                    onClose()
                  }
                }}
                style={styles.agentButton}
                accessibilityRole="button"
                disabled={!connected || writing}
              >
                <Text style={styles.actionText}>
                  {archived ? copy.restoreChat : copy.archiveChat}
                </Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            onPress={() => onClose()}
            style={styles.agentButton}
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>{copy.close}</Text>
          </Pressable>
        </View>
      )}
    </BottomDrawer>
  )
}
