import { MoreHorizontal, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'

export function NativeChatQueuedMessageMenu({
  busy,
  command,
  editDisabled,
  onEdit,
  onMoveEarlier,
  onMoveLater
}: {
  busy: boolean
  command: boolean
  editDisabled: boolean
  onEdit?: () => void
  onMoveEarlier?: () => void
  onMoveLater?: () => void
}): React.JSX.Element | null {
  if (!((!command && onEdit) || onMoveEarlier || onMoveLater)) {
    return null
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={busy}
          aria-label={translate(
            'components.native-chat.queuedMessages.moreActions',
            'More actions'
          )}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!command && onEdit ? (
          <DropdownMenuItem disabled={editDisabled} onSelect={onEdit}>
            <Pencil />
            {translate('components.native-chat.queuedMessages.editMessage', 'Edit message')}
          </DropdownMenuItem>
        ) : null}
        {onMoveEarlier ? (
          <DropdownMenuItem disabled={editDisabled} onSelect={onMoveEarlier}>
            {translate('components.native-chat.queuedMessages.moveEarlier', 'Move earlier')}
          </DropdownMenuItem>
        ) : null}
        {onMoveLater ? (
          <DropdownMenuItem disabled={editDisabled} onSelect={onMoveLater}>
            {translate('components.native-chat.queuedMessages.moveLater', 'Move later')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
