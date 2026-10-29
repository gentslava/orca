import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { NativeChatTextBlock } from '../../../../../src/shared/native-chat-types'
import { activateMobileUiLocale } from '../../../i18n/mobile-i18n'
import { MobileNativeChatErrorNotice } from './MobileNativeChatErrorNotice'
import { MobileNativeChatAutoApprovalNotice } from './MobileNativeChatAutoApprovalNotice'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({
  AlertCircle: 'AlertCircle',
  AlertTriangle: 'AlertTriangle',
  Check: 'Check',
  ChevronRight: 'ChevronRight'
}))

let renderer: ReactTestRenderer | undefined
afterEach(async () => {
  act(() => renderer?.unmount())
  renderer = undefined
  await activateMobileUiLocale('en')
})
const payload = {
  head: 'Available provider detail'.repeat(500),
  byteLength: 32768,
  digest: 'digest',
  truncated: true
}
const cases: { block: NativeChatTextBlock; english: string; russian: string; error?: boolean }[] = [
  {
    block: { type: 'text', tone: 'error', text: 'Provider error' },
    english: 'Agent reported an error',
    russian: 'Агент сообщил об ошибке',
    error: true
  },
  ...(
    [
      [
        'Automatic approval review approved (ok): command',
        'Automatic approval granted',
        'Автоматически одобрено'
      ],
      [
        'Automatic approval review rejected: command',
        'Automatic approval rejected',
        'Автоматическое одобрение отклонено'
      ],
      [
        'Automatic approval review denied: command',
        'Automatic approval denied',
        'Автоматическое одобрение запрещено'
      ],
      [
        'Automatic approval review timed out.',
        'Automatic approval timed out',
        'Время автоматического одобрения истекло'
      ]
    ] as const
  ).map(([text, english, russian]) => ({
    block: {
      type: 'text' as const,
      tone: 'warning',
      text,
      providerFrame: { provider: 'codex', kind: 'notification:warning', payload }
    },
    english,
    russian
  })),
  {
    block: {
      type: 'text',
      tone: 'error',
      text: 'Permission for this command was denied by a built-in Claude Code safety check, not by the user. Unsafe command. The command was NOT run; What was flagged: deletion',
      providerFrame: { provider: 'claude', kind: 'message:system:permission_denied', payload }
    },
    english: 'Permission denied by safety check',
    russian: 'Действие запрещено проверкой безопасности'
  }
]

it.each(cases)(
  'updates the collapsed notice header with the UI language: $english',
  async ({ block, english, russian, error }) => {
    await act(async () => {
      renderer = create(
        error ? (
          <MobileNativeChatErrorNotice block={block} fontScale={1} />
        ) : (
          <MobileNativeChatAutoApprovalNotice block={block} fontScale={1} />
        )
      )
    })
    expect(JSON.stringify(renderer?.toJSON())).toContain(english)
    expect(JSON.stringify(renderer?.toJSON())).not.toContain(block.text)
    await act(async () => activateMobileUiLocale('ru'))
    expect(JSON.stringify(renderer?.toJSON())).toContain(russian)
    expect(JSON.stringify(renderer?.toJSON())).not.toContain(english)
  }
)

it.each(['error', 'approval'] as const)(
  'preserves bounded provider payload metadata after expanding an %s notice',
  async (kind) => {
    const block: NativeChatTextBlock = {
      ...cases[kind === 'error' ? 0 : 2]!.block,
      providerFrame: { provider: 'codex', kind: 'notification:warning', payload }
    }
    await act(async () => {
      renderer = create(
        kind === 'error' ? (
          <MobileNativeChatErrorNotice block={block} fontScale={1} />
        ) : (
          <MobileNativeChatAutoApprovalNotice block={block} fontScale={1} />
        )
      )
    })
    expect(JSON.stringify(renderer?.toJSON())).not.toContain(payload.head)
    await act(async () => {
      renderer?.root.findByProps({ accessibilityRole: 'button' }).props.onPress()
    })
    const text = JSON.stringify(renderer?.toJSON())
    expect(text).toContain(payload.head)
    expect(text).toContain('32.0 KB')
    expect(text).toContain('Showing')
    expect(text).not.toContain('Show full output')
  }
)
