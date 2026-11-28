import React, { Suspense, useId } from 'react'
import { useAppStore } from '@/store/index'
import { useTranslate } from '@/i18n/use-translate'
import { SidebarHeaderActions } from './sidebar-header-actions'
import { SidebarSectionHeader } from '../SidebarSectionHeader'
import { PROJECTS_SECTION_GROUP_KEY } from '../../../../../shared/sidebar-list/sections/group-keys'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Bell, ChevronDown, FolderTree, MessagesSquare, Activity } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useSidebarBodyTitles } from './sidebar-view-titles'
import { cn } from '@/lib/class-names'
import { lazyWithRetry } from '@/app-shell/startup/lazy-with-retry'
import { useLatchedOpen } from '@/app-shell/root-surfaces/use-latched-open'

const LazyAgentsSidebarIntroPopoverContent = lazyWithRetry(
  () =>
    import('./AgentsSidebarIntroPopoverContent').then((module) => ({
      default: module.AgentsSidebarIntroPopoverContent
    })),
  { reloadKey: 'agents-sidebar-intro-popover-content' }
)

type SidebarHeaderProps = {
  activityBadgeTarget?: React.Ref<HTMLSpanElement>
  onWorkspaceBoardMenuOpenChange: (open: boolean) => void
  activityOptionsTarget?: React.Ref<HTMLDivElement>
  /** Only with Bots present, so the sidebar never folds down to nothing. */
  collapsible?: boolean
  projectsCollapseTarget?: React.Ref<HTMLDivElement>
}

const SidebarHeader = React.memo(function SidebarHeader({
  activityBadgeTarget,
  onWorkspaceBoardMenuOpenChange,
  activityOptionsTarget,
  collapsible = false,
  projectsCollapseTarget
}: SidebarHeaderProps) {
  const t = useTranslate()
  const sidebarBody = useAppStore((s) => s.sidebarBody ?? 'workspaces')
  const groupBy = useAppStore((s) => s.groupBy)
  const sidebarView = useAppStore((s) => s.sidebarView)
  const chooseSidebarView = useAppStore((s) => s.chooseSidebarView)
  const setSidebarBody = useAppStore((s) => s.setSidebarBody)
  const titles = useSidebarBodyTitles()
  const updateSettings = useAppStore((s) => s.updateSettings)
  const agentsViewActive = sidebarBody === 'agents'
  const activityBadgeId = useId()
  const agentsSidebarIntroShown = useAppStore((s) => s.settings?.agentsSidebarIntroShown === true)
  const migratedFromExperimental = useAppStore(
    (s) => s.settings?.agentsSidebarMigratedFromExperimental === true
  )
  const introTitleId = useId()
  const introDescriptionId = useId()
  // Existing users who opted into the former Experimental Agents view get one explanation.
  const introOpen = migratedFromExperimental && !agentsSidebarIntroShown
  const hasOpenedIntro = useLatchedOpen(introOpen)
  const acknowledgeIntro = React.useCallback(() => {
    void updateSettings?.({ agentsSidebarIntroShown: true })
  }, [updateSettings])
  const projectsCollapsed = useAppStore(
    (s) => collapsible && s.collapsedGroups.has(PROJECTS_SECTION_GROUP_KEY)
  )
  const toggleCollapsedGroup = useAppStore((s) => s.toggleCollapsedGroup)
  const sectionId = groupBy === 'repo' ? 'projects' : 'workspaces'
  const sidebarTitle = titles[sidebarBody]
  const activityLabel = t(
    agentsViewActive ? 'dashboard.sidebar.closeActivity' : 'dashboard.sidebar.openActivity',
    agentsViewActive ? 'Turn off activity view' : 'View activity'
  )

  const fold = collapsible
    ? {
        collapsed: projectsCollapsed,
        label: projectsCollapsed
          ? t('sidebar.projectsSection.expand', 'Expand {{title}}', { title: sidebarTitle })
          : t('sidebar.projectsSection.collapse', 'Collapse {{title}}', {
              title: sidebarTitle
            }),
        onToggle: () => toggleCollapsedGroup(PROJECTS_SECTION_GROUP_KEY)
      }
    : undefined

  return (
    <SidebarSectionHeader
      title={sidebarTitle}
      sectionId={sectionId}
      reorderable={collapsible}
      fold={fold}
      titleControl={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              // relative lifts the trigger above the header's full-width fold button.
              className="relative min-w-0"
              data-sidebar-section-title={
                sidebarBody === 'conversations'
                  ? 'sessions'
                  : sidebarBody === 'agents'
                    ? 'activity'
                    : sectionId
              }
            >
              {/* Truncate localized titles because fixed-width actions cannot shrink inside the short header row. */}
              <span className="truncate font-semibold text-muted-foreground/80">
                {sidebarTitle}
              </span>
              <ChevronDown aria-hidden="true" className="size-3 text-muted-foreground/80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => chooseSidebarView('workspaces')}>
              <FolderTree />
              {titles.workspaces}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => chooseSidebarView('conversations')}>
              <MessagesSquare />
              {titles.conversations}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSidebarBody('agents')}>
              <Activity />
              {titles.agents}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      tourTarget={groupBy === 'repo' ? 'projects-collapse-all' : undefined}
      // WorktreeList portals the collapse-all toggle here; it owns the rendered project rows.
      titleAccessory={
        <div
          ref={projectsCollapseTarget}
          className="relative flex shrink-0 items-center empty:hidden"
        />
      }
      actions={
        <>
          <Popover
            open={introOpen}
            onOpenChange={(open) => {
              if (!open) {
                acknowledgeIntro()
              }
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0">
                  <PopoverAnchor asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        'w-8 text-muted-foreground',
                        agentsViewActive &&
                          'bg-foreground/10 text-foreground hover:bg-foreground/15 dark:hover:bg-foreground/15'
                      )}
                      aria-label={activityLabel}
                      aria-pressed={agentsViewActive}
                      aria-describedby={activityBadgeId}
                      onClick={() => setSidebarBody(agentsViewActive ? sidebarView : 'agents')}
                    >
                      <span className="relative h-5 w-6 shrink-0">
                        <Bell className="absolute left-0 top-1 size-3" />
                        <span
                          id={activityBadgeId}
                          ref={activityBadgeTarget}
                          className="pointer-events-none absolute inset-0"
                        />
                      </span>
                    </Button>
                  </PopoverAnchor>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {activityLabel}
              </TooltipContent>
            </Tooltip>
            {hasOpenedIntro ? (
              <Suspense fallback={null}>
                <LazyAgentsSidebarIntroPopoverContent
                  introTitleId={introTitleId}
                  introDescriptionId={introDescriptionId}
                  onAcknowledge={acknowledgeIntro}
                />
              </Suspense>
            ) : null}
          </Popover>
          <SidebarHeaderActions
            onWorkspaceBoardMenuOpenChange={onWorkspaceBoardMenuOpenChange}
            conversationNavigation={sidebarBody === 'conversations'}
            agentsViewActive={sidebarBody !== 'workspaces'}
            activityOptionsTarget={activityOptionsTarget}
          />
        </>
      }
    />
  )
})

export default SidebarHeader
