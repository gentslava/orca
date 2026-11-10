import type { NativeChatTextBlock } from '../../../../../src/shared/native-chat/native-chat-types'
import type { MobileNativeChatNoticeView } from '../../mobile-native-chat-notice-context'
import { readWholeAgentSessionFailureFact } from '../../../../../src/shared/agent-session/failures/agent-session-failure'
import { agentSessionFailureSentence } from '../../../../../src/shared/agent-session/failures/agent-session-failure-words'
import { nativeChatOrcaStopRowText } from '../../../../../src/shared/native-chat/native-chat-orca-stop-words'
import { nativeChatOrcaStopSay } from './native-chat-orca-stop-copy'
import { nativeChatUsageLimitText } from './native-chat-usage-limit-copy'
import { sayMobileAgentSessionFailure } from '../../agent-session-failure-copy'
import type { Translate } from '../../../i18n/mobile-i18n'

export function nativeChatNoticeCopy(t: Translate) {
  return {
    compaction: t('chat.notice.compaction', 'Context compacted'),
    contextCleared: t('chat.notice.contextCleared', 'Context cleared'),
    forkedFrom: t('chat.notice.forkedFrom', 'Forked from'),
    plan: t('chat.notice.plan', 'Plan')
  }
}

export function nativeChatHostStatusCopy(t: Translate) {
  return {
    'history-repaired': t(
      'chat.hostStatus.historyRepaired',
      "Part of this chat's history couldn't be loaded."
    ),
    'history-item-too-large': t(
      'chat.hostStatus.historyItemTooLarge',
      'This part of the chat was too large to show.'
    ),
    'continued-outside': t('chat.hostStatus.continuedOutside', 'Continued outside this chat.'),
    'continued-outside-rewound': t(
      'chat.hostStatus.continuedOutsideRewound',
      "Continued outside this chat. Earlier replies above are no longer in this conversation's history."
    )
  }
}

// The phone always reads its Orca host as remote.
export function nativeChatNoticeLineText(
  notice: NativeChatTextBlock,
  names: MobileNativeChatNoticeView,
  t: Translate
): string {
  if (notice.orcaStop) {
    const say = nativeChatOrcaStopSay(t)
    return nativeChatOrcaStopRowText(
      notice.orcaStop.cause,
      names.hostName ?? say('unnamedServer'),
      { continueAvailable: names.continuation?.continueAvailable === true, remoteHost: true },
      say
    )
  }
  const failure = readWholeAgentSessionFailureFact(notice.failure)
  if (failure?.kind === 'usageLimitReached') {
    return nativeChatUsageLimitText(failure.usageLimit, names.agentName, t)
  }
  // Only reword text fully described by its fact; other host text stays as written.
  const context = { agentName: names.agentName }
  const surface =
    failure &&
    [
      'savedConversationMissing',
      'pluginInputRequired',
      'modelUnavailable',
      'providerUnavailable',
      'providerSafetyStopped',
      'providerResponseFailed'
    ].includes(failure.kind)
      ? (['row', 'rejection'] as const).find(
          (candidate) => notice.text === agentSessionFailureSentence(failure, candidate, context)
        )
      : undefined
  return failure && surface
    ? agentSessionFailureSentence(failure, surface, context, sayMobileAgentSessionFailure)
    : notice.text
}

// Render system notices separately so they cannot read as the agent’s own prose.
