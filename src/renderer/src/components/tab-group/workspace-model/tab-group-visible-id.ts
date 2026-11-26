import type { Tab } from '../../../../../shared/workspace-layout/tab-groups/tab-types'

export function resolveGroupTabFromVisibleId(
  groupTabs: readonly Tab[],
  visibleId: string
): Tab | null {
  return (
    groupTabs.find((candidate) => candidate.id === visibleId || candidate.entityId === visibleId) ??
    null
  )
}

export function runGroupTabCommand(
  groupTabs: readonly Tab[],
  visibleId: string,
  command: (tabId: string) => void
): void {
  const item = resolveGroupTabFromVisibleId(groupTabs, visibleId)
  if (item) {
    command(item.id)
  }
}
