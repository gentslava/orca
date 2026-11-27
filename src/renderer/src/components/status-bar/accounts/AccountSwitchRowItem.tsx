import { Check } from 'lucide-react'
import React from 'react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'

export function AccountSwitchRowItem({
  label,
  detail,
  active,
  children,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<typeof DropdownMenuItem>, 'children'> & {
  label: string
  /** Secondary line, e.g. workspace or the ID that tells same-email accounts apart. */
  detail?: string | null
  active: boolean
  /** Usage details beneath the account identity. */
  children?: React.ReactNode
  /** Rendered beside the item, not inside it, so its own menu item stays separately focusable. */
  action?: React.ReactNode
}): React.JSX.Element {
  const t = useTranslate()
  return (
    // Why the wrapper owns the fill: the row and its action are two menu items that must hover as one.
    <div
      data-current={active ? 'true' : undefined}
      className="flex items-center rounded-[8px] data-[current=true]:bg-accent not-data-[current=true]:hover:has-[[role=menuitem]:not([data-disabled])]:bg-black/8 not-data-[current=true]:has-[[data-highlighted]]:bg-black/8 dark:not-data-[current=true]:hover:has-[[role=menuitem]:not([data-disabled])]:bg-white/14 dark:not-data-[current=true]:has-[[data-highlighted]]:bg-white/14"
    >
      <DropdownMenuItem
        title={detail ? `${label}\n${detail}` : label}
        {...props}
        aria-current={active ? 'true' : undefined}
        data-current={active ? 'true' : undefined}
        variant="account-row"
        className={cn('min-w-0 flex-1', className)}
      >
        <span className="flex w-4 shrink-0 self-start justify-center pt-0.5">
          {active ? (
            <>
              <Check className="size-3.5" />
              <span className="sr-only">
                {t('auto.components.status.bar.StatusBar.ff0fbe9311', 'Active')}
              </span>
            </>
          ) : null}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{label}</span>
          {detail ? (
            <span className="truncate text-2xs text-muted-foreground">{detail}</span>
          ) : null}
          {children ? <div className="mt-1 text-xs">{children}</div> : null}
        </div>
      </DropdownMenuItem>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
