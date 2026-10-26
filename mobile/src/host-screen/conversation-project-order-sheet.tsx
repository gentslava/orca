import { ActionSheetModal } from '../components/ActionSheetModal'
import { WORKSPACE_PROJECT_ORDER_CHOICES } from '../../../src/shared/workspace-view/workspace-view-options'
import type { HostScreenController } from './use-host-screen-controller'
import { conversationCopy } from './conversation-copy'

export function ConversationProjectOrderSheet({
  visible,
  onClose,
  controller
}: {
  visible: boolean
  onClose: () => void
  controller: HostScreenController
}) {
  const copy = conversationCopy()
  const connected = controller.connState === 'connected'
  return (
    <ActionSheetModal
      visible={visible}
      title={copy.projectOrder}
      onClose={() => onClose()}
      actions={WORKSPACE_PROJECT_ORDER_CHOICES.map((choice) => ({
        label: `${controller.projectOrderBy === choice.id ? '✓ ' : ''}${copy.projectOrderLabels[choice.id]}`,
        onPress: () => {
          void controller.settings.setProjectOrderBy(choice.id)
        },
        disabled:
          !connected ||
          (!controller.settings.supportsPersonalProjectOrder &&
            (choice.id === 'name' || choice.id === 'frequent'))
      }))}
    />
  )
}
