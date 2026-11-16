import { agentJournalToolCallLifecycle } from '../../agent-session/journal/agent-journal-tool-call-lifecycle'
import {
  isToolCallBlock,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '../native-chat-types'
import { diffFromToolCall, type NativeChatDiffLine } from './native-chat-diff'
import { toolWebSearchResults, type NativeChatWebSearchResult } from './native-chat-tool-identity'
import {
  nativeChatToolLineLabel,
  type NativeChatToolLineLabel
} from './native-chat-tool-line-label'

export type NativeChatToolLineView = {
  call: NativeChatToolCallBlock | undefined
  label: NativeChatToolLineLabel | null
  /** The paired result, or a lone result itself. */
  body: NativeChatToolResultBlock | undefined
  /** A lone result's first line, its row's only words. */
  resultPreview: string
  failed: boolean
  /** Link-safe hits only, so unsafe-only results do not open an empty panel. */
  results: NativeChatWebSearchResult[]
  hasDetail: boolean
}

const NO_SEARCH_RESULTS: NativeChatWebSearchResult[] = []

export function nativeChatToolLineView(
  block: NativeChatToolCallBlock | NativeChatToolResultBlock,
  result?: NativeChatToolResultBlock
): NativeChatToolLineView {
  const call = isToolCallBlock(block) ? block : undefined
  const label = call ? nativeChatToolLineLabel(call, result) : null
  const body = call ? result : block.type === 'tool-result' ? block : undefined
  // A call the reader stopped was cut short, not failed.
  const lifecycle = call ? agentJournalToolCallLifecycle(call) : null
  const failed = lifecycle === 'failed' || (lifecycle !== 'interrupted' && result?.isError === true)
  const results = call ? toolWebSearchResults(call.webSearchResults) : NO_SEARCH_RESULTS
  const hasDetail = call !== undefined || body !== undefined
  const resultPreview = call ? '' : (body?.output.split('\n')[0]?.slice(0, 80) ?? '')
  return { call, label, body, resultPreview, failed, results, hasDetail }
}

export type NativeChatToolCallInputView = {
  diff: NativeChatDiffLine[] | null
  /** The command to draw highlighted, when it is the whole input. */
  command: string | null
  /** False when the diff or the command already is the input. */
  showsBody: boolean
}

/** Derived on open, so collapsed rows do no diff work. */
export function nativeChatToolCallInputView(
  call: NativeChatToolCallBlock,
  label: NativeChatToolLineLabel | null
): NativeChatToolCallInputView {
  const diff = diffFromToolCall(call.name, call.input)
  const command = diff ? null : (label?.commandDetail ?? null)
  return { diff, command, showsBody: diff === null && command === null }
}
