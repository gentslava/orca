import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { UsageAccountQuotas } from '@/components/stats/UsageAccountQuotas'
import { UsageOverviewPane } from '@/components/stats/UsageOverviewPane'
import { WorkerRoleSettings } from '@/components/settings/WorkerRoleSettings'
import { setRendererUiLanguage } from '@/i18n/i18n'
import { buildDefaultSettings } from '../../../src/shared/default-global-settings'
import { getDefaultVoiceSettings } from '../../../src/shared/constants'
import { getDefaultNotificationSettings } from '../../../src/shared/notification-settings-defaults'
import { createEmptyRateLimitState } from '../../../src/shared/rate-limit-state-factory'
import { localUsageDay } from '../../../src/shared/usage-history-range'
import type { ProviderRateLimits } from '../../../src/shared/rate-limit-types'
import type { GlobalSettings } from '../../../src/shared/global-settings-types'
import type { UsageHistoryProvider, UsageHistoryRow } from '../../../src/shared/usage-history-types'
import type { ProviderAccountsSnapshot } from '@/runtime/runtime-provider-accounts-client'

const now = Date.now()
const rows: UsageHistoryRow[] = Array.from({ length: 20 }, (_, index) => ({
  provider: index % 3 === 0 ? 'claude' : 'codex',
  accountId: index % 3 === 0 ? null : index % 2 === 0 ? 'work' : 'personal',
  day: localUsageDay(new Date(now - index * 86400000)),
  sessionId: `fixture-session-${index}`,
  model: index % 3 === 0 ? 'claude-sonnet' : 'gpt-fixture',
  projectKey: index % 2 === 0 ? 'orca' : 'website',
  projectLabel: index % 2 === 0 ? 'Orca' : 'Website',
  inOrca: true,
  newInputTokens: (index + 1) * 100,
  cacheReadTokens: (index + 1) * 900,
  cacheWriteTokens: 0,
  outputTokens: (index + 1) * 200,
  reasoningTokens: (index + 1) * 150,
  activityCount: index + 1,
  totalTokens: (index + 1) * 1200,
  apiEquivalentCostUsd: (index + 1) * 0.01
}))

function collector(provider: UsageHistoryProvider) {
  return {
    getSnapshot: async () => ({
      scanState: {
        enabled: true,
        isScanning: false,
        lastScanCompletedAt: now,
        lastScanError: null
      },
      history: rows.filter((row) => row.provider === provider)
    }),
    refresh: async () => {},
    setEnabled: async () => {}
  }
}

function quota(provider: 'claude' | 'codex', usedPercent: number): ProviderRateLimits {
  return {
    provider,
    planType: provider === 'claude' ? 'max' : 'pro',
    status: 'ok',
    error: null,
    updatedAt: now,
    session: {
      usedPercent,
      windowMinutes: 300,
      resetsAt: now + 7200000,
      resetDescription: null
    },
    weekly: {
      usedPercent: usedPercent + 15,
      windowMinutes: 10080,
      resetsAt: now + 172800000,
      resetDescription: null
    }
  }
}

const quotas = createEmptyRateLimitState({
  claude: quota('claude', 20),
  codex: quota('codex', 35),
  inactiveCodexAccounts: [
    { accountId: 'personal', rateLimits: quota('codex', 55), updatedAt: now, isFetching: false }
  ]
})
const accounts: ProviderAccountsSnapshot = {
  claude: { accounts: [], activeAccountId: null },
  codex: {
    activeAccountId: 'work',
    accounts: ['work', 'personal'].map((id) => ({
      id,
      workspaceLabel: id === 'work' ? 'Work' : 'Personal',
      email: 'example@fixture.test',
      managedHomeRuntime: 'host',
      createdAt: now,
      updatedAt: now,
      lastAuthenticatedAt: now
    }))
  },
  rateLimits: null
}

Object.defineProperty(window, 'api', {
  configurable: true,
  value: {
    ...window.api,
    claudeUsage: collector('claude'),
    codexUsage: collector('codex'),
    openCodeUsage: collector('opencode'),
    museUsage: collector('muse')
  }
})

export function SettingsFixture() {
  useTranslation()
  const [dark, setDark] = useState(true)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  const [russian, setRussian] = useState(false)
  const [tab, setTab] = useState<'usage' | 'roles'>('usage')
  const [settings, setSettings] = useState<GlobalSettings>({
    ...buildDefaultSettings({
      workspaceDir: '',
      appFontFamily: 'Geist',
      editorAutoSaveDelayMs: 1000,
      primarySelectionMiddleClickPaste: false,
      primarySelectionDefaultedForLinux: false,
      terminalFontFamily: 'JetBrains Mono',
      terminalInactivePaneOpacity: 0.5,
      terminalRightClickToPaste: false,
      notifications: getDefaultNotificationSettings(),
      voice: getDefaultVoiceSettings()
    }),
    orchestrationWorkerRoles: {
      research: { agent: 'claude' },
      implementation: { agent: 'codex' },
      review: { agent: 'codex' }
    }
  })
  return (
    <main
      className={`${dark ? 'dark ' : ''}h-screen overflow-y-auto bg-background text-foreground`}
    >
      <header className="sticky top-0 z-10 flex flex-wrap gap-2 border-b border-border bg-background px-4 py-2">
        <Button size="sm" variant="ghost" onClick={() => setTab('usage')}>
          Usage fixture
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTab('roles')}>
          Roles fixture
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDark(!dark)}>
          Toggle theme
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await setRendererUiLanguage(russian ? 'en' : 'ru')
            setRussian(!russian)
          }}
        >
          {russian ? 'English' : 'Русский'}
        </Button>
      </header>
      <div className="@container mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        {tab === 'usage' ? (
          <>
            <UsageAccountQuotas
              rateLimits={quotas}
              accounts={accounts}
              ownerLabel="Fixture host"
              onRefresh={() => {}}
              onManage={() => {}}
            />
            <UsageOverviewPane ownerLabel="Fixture host" />
          </>
        ) : (
          <WorkerRoleSettings
            settings={settings}
            updateSettings={(updates) => {
              setSettings((current) => ({ ...current, ...updates }))
            }}
          />
        )}
      </div>
    </main>
  )
}
