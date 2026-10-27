import { EyeOff, Folder, Pin, PinOff } from 'lucide-react-native'
import { ActionSheetModal } from '../components/ActionSheetModal'
import type { HostScreenController } from './use-host-screen-controller'
import type { ConversationProject } from './project-conversations'
import { conversationCopy } from './conversation-copy'

export function ConversationProjectActionsSheet({
  project,
  controller,
  onClose,
  onWorkspaces,
  onHide
}: {
  project: ConversationProject | null
  controller: HostScreenController
  onClose: () => void
  onWorkspaces: () => void
  onHide?: () => void
}) {
  const copy = conversationCopy()
  const pinned = project?.projectPreference?.pinned === true
  return (
    <ActionSheetModal
      visible={project !== null}
      title={project?.title}
      onClose={onClose}
      actions={[
        ...(project?.repo
          ? [
              {
                label: pinned ? copy.unpinProject : copy.pinProject,
                icon: pinned ? PinOff : Pin,
                disabled:
                  controller.connState !== 'connected' ||
                  !controller.settings.supportsPersonalProjectOrder,
                onPress: () => {
                  if (project.repo) {
                    void controller.settings.toggleProjectPin(project.repo)
                  }
                }
              }
            ]
          : []),
        { label: copy.workspaces, icon: Folder, onPress: onWorkspaces },
        {
          label: copy.hideProject,
          icon: EyeOff,
          hint: copy.keepFiles,
          disabled: !onHide,
          onPress: () => onHide?.()
        }
      ]}
    />
  )
}
