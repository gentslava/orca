import { AlertCircle, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { NATIVE_CHAT_NOTICE_COPY } from '../../../../shared/native-chat/native-chat-notice'
import type { NativeChatTextBlock } from '../../../../shared/native-chat-types'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'
import { ProviderFrameRow } from './NativeChatTranscriptChrome'

export function NativeChatErrorNotice({
  block,
  messageId,
  text = block.text,
  detail
}: {
  block: NativeChatTextBlock
  messageId?: string
  text?: string
  detail?: string
}) {
  const { open, setOpen } = useNativeChatDisclosure(
    messageId === undefined ? undefined : `error-notice:${messageId}`,
    false
  )
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger variant="transcript" className="group/error-notice">
        <span className="flex min-w-0 items-center gap-1.5">
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {translate(
              'components.native-chat.notices.agentError',
              NATIVE_CHAT_NOTICE_COPY.agentError
            )}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]/error-notice:rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 py-1 text-sm text-destructive">
          <p className="whitespace-pre-wrap break-words">{text}</p>
          {detail ? <p className="whitespace-pre-wrap break-words">{detail}</p> : null}
          <ProviderFrameRow
            block={block}
            summary={translate('components.native-chat.notices.details', 'Details')}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
