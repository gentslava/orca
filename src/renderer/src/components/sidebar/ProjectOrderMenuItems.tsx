import { useAppStore } from '@/store'
import { usePersonalProjectOrderSupported } from '@/hooks/use-personal-project-order'
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { PROJECT_ORDER_OPTIONS } from './worktree-list/controls/sidebar-workspace-option-items'

export function ProjectOrderMenuItems({ keepOpen = false }: { keepOpen?: boolean }) {
  const t = useTranslate()
  const order = useAppStore((state) => state.projectOrderBy)
  const setOrder = useAppStore((state) => state.setProjectOrderBy)
  const supported = usePersonalProjectOrderSupported()
  return (
    <DropdownMenuRadioGroup
      value={order}
      onValueChange={(value) => {
        const next = PROJECT_ORDER_OPTIONS.find((option) => option.id === value)
        if (next && (supported || next.id === 'manual' || next.id === 'recent')) {
          setOrder(next.id)
        }
      }}
    >
      {PROJECT_ORDER_OPTIONS.map((option) => (
        <Tooltip key={option.id}>
          <TooltipTrigger asChild>
            <DropdownMenuRadioItem
              value={option.id}
              disabled={!supported && (option.id === 'name' || option.id === 'frequent')}
              onSelect={keepOpen ? (event) => event.preventDefault() : undefined}
            >
              {option.label}
            </DropdownMenuRadioItem>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>
            {!supported && option.id === 'recent'
              ? t(
                  'auto.components.sidebar.SidebarWorkspaceOptionsMenu.af9249c505',
                  'Most recent workspace activity'
                )
              : option.description}
          </TooltipContent>
        </Tooltip>
      ))}
    </DropdownMenuRadioGroup>
  )
}
