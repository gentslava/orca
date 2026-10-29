import { useEffect, useMemo } from 'react'
import type { PluginHostListEntry, PluginHostNewFile } from '../../../preload/api-types'
import { ensurePluginPanelsLoaded, usePluginPanelsStore } from './plugin-panels'

/** A new-file type from an enabled plugin. `key` is unique across plugins; `iconUrl` is its own
 *  icon, else the plugin's. */
export type ActivePluginNewFile = PluginHostNewFile & {
  key: string
  pluginKey: string
  pluginName: string
  iconUrl?: string
}

/** Same liveness as panels and custom editors: enabled and consented. */
export function collectActivePluginNewFiles(
  plugins: readonly PluginHostListEntry[]
): ActivePluginNewFile[] {
  return plugins
    .filter(
      (plugin) =>
        plugin.status === 'running' || plugin.status === 'restarting' || plugin.status === 'idle'
    )
    .flatMap((plugin) =>
      (plugin.newFiles ?? []).map((newFile) => {
        const iconUrl = newFile.icon ?? plugin.images?.icon?.url
        return {
          ...newFile,
          key: `${plugin.pluginKey}/${newFile.id}`,
          pluginKey: plugin.pluginKey,
          pluginName: plugin.name,
          ...(iconUrl ? { iconUrl } : {})
        }
      })
    )
}

/** New-file types of enabled plugins, sharing the plugin-list refresh. */
export function usePluginNewFiles(): ActivePluginNewFile[] {
  const plugins = usePluginPanelsStore((state) => state.plugins)
  useEffect(() => {
    ensurePluginPanelsLoaded()
  }, [])
  // Why gated: a client without the template reader (a paired web client) cannot create them.
  return useMemo(
    () => (window.api?.plugins?.readNewFileTemplate ? collectActivePluginNewFiles(plugins) : []),
    [plugins]
  )
}
