import { useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import { nativeChatToolFailures } from '../../../../shared/native-chat-tool-failures'
import { nativeChatToolLineIdentity } from '../../../../shared/native-chat-tool-line-identity'
import type { NativeChatBlock } from '../../../../shared/native-chat-types'
import { nativeChatToolLineLabel } from './native-chat-tool-line-label'

/** Failures stay readable even while ordinary activity is collapsed. */
export function NativeChatToolRunFailures({
  blocks
}: {
  blocks: readonly NativeChatBlock[]
}): React.JSX.Element | null {
  const failures = useMemo(() => nativeChatToolFailures(blocks), [blocks])
  if (failures.length === 0) {
    return null
  }
  const seen = new Map<string, number>()
  return (
    <div className="space-y-1 py-1 text-sm text-destructive" role="alert">
      {failures.map(({ call, result }) => {
        const label = call ? nativeChatToolLineLabel(call, result) : null
        const name =
          label?.target || call?.name || translate('components.native-chat.tool.result', 'Result')
        const detail =
          result?.output ||
          translate('components.native-chat.tool.failedCount', '{{value0}} failed', { value0: 1 })
        const block = call ?? result
        return block ? (
          <p
            key={nativeChatToolLineIdentity(block, seen)}
            data-native-chat-failed-call-id={call?.callId}
            className="max-h-64 overflow-auto whitespace-pre-wrap break-words scrollbar-sleek"
          >
            {`${name}: ${detail}`}
          </p>
        ) : null
      })}
    </div>
  )
}
