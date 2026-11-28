import type { MouseEventHandler } from 'react'
import { cn } from '@/lib/class-names'

// Why: start on the divider pixel so pointing at the visible seam resizes instead of scrolling the list.
export const WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME =
  'peer absolute -right-[9px] top-0 z-20 h-full w-[9px] cursor-col-resize'
// Why: an open drawer covers the outer side of the seam, so keep the inner overlap wide enough to grab.
const WORKTREE_SIDEBAR_RESIZE_HANDLE_UNDER_DRAWER_CLASS_NAME = '-right-1.5 w-3'
export const WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME =
  'pointer-events-none absolute -right-px top-0 z-20 h-full w-px bg-transparent transition-colors peer-hover:bg-ring/50 peer-active:bg-ring'

export function SidebarResizeSeam({
  covered,
  resizing,
  onResizeStart
}: {
  covered: boolean
  resizing: boolean
  onResizeStart: MouseEventHandler<HTMLDivElement>
}): React.JSX.Element {
  return (
    <>
      <div
        data-sidebar-resize-handle=""
        className={cn(
          WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME,
          covered && WORKTREE_SIDEBAR_RESIZE_HANDLE_UNDER_DRAWER_CLASS_NAME,
          resizing && 'bg-ring/10'
        )}
        onMouseDown={onResizeStart}
      />
      <div className={cn(WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME, resizing && 'bg-ring')} />
    </>
  )
}
