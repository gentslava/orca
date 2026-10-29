import { BadgeCheck } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { PluginRowArt } from './PluginRowArt'
import type { PluginListEntry } from './plugin-list-entries'

/** One installed plugin while plugins are off: who is installed, offering nothing. */
export function PluginListRow({
  entry,
  description,
  chips
}: {
  entry: PluginListEntry
  description: React.ReactNode
  chips?: React.ReactNode
}): React.JSX.Element {
  return (
    <li
      className="pointer-events-none relative grid min-h-15 grid-cols-[2rem_minmax(0,1fr)_auto_auto_2.5rem_1.75rem] items-center gap-x-3 border-t border-border py-2.5 pr-3 pl-4 first:border-t-0 @max-xl/plugin-list:items-start"
      data-plugin-key={entry.pluginKey}
    >
      <div className="opacity-55">
        <PluginRowArt entry={entry} />
      </div>
      <div className="min-w-0 opacity-55">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium">{entry.name}</span>
          {entry.official ? (
            <BadgeCheck
              className="plugin-security-chrome size-3.5 shrink-0 text-muted-foreground"
              role="img"
              aria-label={translate(
                'auto.components.pluginCatalog.PluginListRow.official',
                'Official'
              )}
            />
          ) : null}
          {chips}
          {entry.publisher ? (
            <span className="min-w-0 shrink-[9999] truncate text-xs text-muted-foreground @max-xl/plugin-list:hidden">
              {entry.publisher}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground @max-xl/plugin-list:line-clamp-2 @max-xl/plugin-list:whitespace-normal">
          {description}
        </p>
      </div>
      {/* Why empty cells: they reserve the trailing grid columns, so descriptions keep a steady width. */}
      <div className="w-33 @max-xl/plugin-list:w-auto" />
      <div className="w-28 @max-xl/plugin-list:w-auto" />
      <div />
      <div />
    </li>
  )
}
