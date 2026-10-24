import { Check, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import type { NativeChatTextBlock } from '../../../../shared/native-chat-types'
import { ProviderFrameRow } from './NativeChatTranscriptChrome'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'

export function NativeChatAutoApprovalNotice({
  block,
  messageId,
  disclosed = false
}: {
  block: NativeChatTextBlock
  messageId?: string
  disclosed?: boolean
}): React.JSX.Element {
  const { open, setOpen } = useNativeChatDisclosure(
    messageId === undefined ? undefined : `auto-approval:${messageId}`,
    false
  )
  const details = (
    <div className="space-y-1 py-1 text-sm text-chat-foreground-faint">
      <p className="whitespace-pre-wrap break-words">{block.text}</p>
      <ProviderFrameRow
        block={block}
        summary={translate('components.native-chat.notices.details', 'Details')}
      />
    </div>
  )
  if (disclosed) {
    return details
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger variant="transcript" className="group/auto-approval">
        <Check aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          {translate(
            'components.native-chat.notices.autoApprovalGranted',
            'Automatic approval granted'
          )}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]/auto-approval:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{details}</CollapsibleContent>
    </Collapsible>
  )
}
