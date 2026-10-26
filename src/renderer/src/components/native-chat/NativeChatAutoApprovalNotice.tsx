import { AlertCircle, AlertTriangle, Check, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import type { NativeChatTextBlock } from '../../../../shared/native-chat-types'
import {
  nativeChatAutoApprovalOutcome,
  type NativeChatAutoApprovalOutcome
} from '../../../../shared/native-chat-auto-approval'
import { cn } from '@/lib/utils'
import { ProviderFrameRow } from './NativeChatTranscriptChrome'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'

const OUTCOME_LABEL: Record<NativeChatAutoApprovalOutcome, () => string> = {
  approved: () =>
    translate('components.native-chat.notices.autoApprovalGranted', 'Automatic approval granted'),
  rejected: () =>
    translate('components.native-chat.notices.autoApprovalRejected', 'Automatic approval rejected'),
  denied: () =>
    translate('components.native-chat.notices.autoApprovalDenied', 'Automatic approval denied'),
  'timed-out': () =>
    translate(
      'components.native-chat.notices.autoApprovalTimedOut',
      'Automatic approval timed out'
    ),
  'safety-denied': () =>
    translate(
      'components.native-chat.notices.safetyCheckDenied',
      'Permission denied by safety check'
    )
}

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
  const outcome = nativeChatAutoApprovalOutcome(block) ?? 'approved'
  const Icon =
    outcome === 'approved' ? Check : outcome === 'timed-out' ? AlertCircle : AlertTriangle
  const details = (
    <div
      className={cn(
        'space-y-1 py-1 text-sm',
        block.tone === 'error' ? 'text-destructive' : 'text-chat-foreground-faint'
      )}
    >
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
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{OUTCOME_LABEL[outcome]()}</span>
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
