import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setRendererUiLanguage } from '@/i18n/i18n'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { NativeChatMessageList } from '@/components/native-chat/NativeChatMessageList'
import { NativeChatChildTranscriptStack } from '@/components/native-chat/NativeChatChildTranscript'
import {
  NativeChatChildNavigationContext,
  useNativeChatChildNavigator
} from '@/components/native-chat/native-chat-child-navigation'
import { nativeChatAppearanceStyle } from '@/components/native-chat/native-chat-appearance-style'
import type { NativeChatLiveSession } from '@/components/native-chat/native-chat-live-session-contract'
import type {
  NativeChatMessage,
  NativeChatSubagentEntry
} from '../../../src/shared/native-chat-types'
import type { StructuredAgentSubagentRoster } from '../../../src/shared/structured-agent-session-subagent-roster'
import './fixture.css'
import { QueueFixture } from './queue-fixture'
import { SettingsFixture } from './settings-fixture'
import { installWorkerFixtureRuntime } from './worker-fixture'
import { NativeChatSessionChildren } from '@/components/native-chat/NativeChatSessionChildren'

const view = new URLSearchParams(location.search).get('view')
if (view === 'workers') {
  installWorkerFixtureRuntime()
}

const child: NativeChatSubagentEntry = {
  id: 'research',
  label: 'Research',
  state: 'completed',
  startedAt: 1792850000000,
  settledAt: 1792850004000
}
const nested: NativeChatSubagentEntry = { id: 'review', label: 'Review', state: 'completed' }
const messages: NativeChatMessage[] = [
  {
    id: 'user',
    role: 'user',
    blocks: [{ type: 'text', text: 'Investigate this project.' }],
    timestamp: 1,
    source: 'transcript'
  },
  {
    id: 'intro',
    role: 'assistant',
    blocks: [
      {
        type: 'text',
        text: 'I am checking the implementation and will explain what needs to change.'
      }
    ],
    timestamp: 2,
    source: 'transcript'
  },
  {
    id: 'tools',
    role: 'assistant',
    blocks: [
      {
        type: 'tool-call',
        callId: 'pwd',
        name: 'shell',
        input: { command: 'pwd' },
        state: 'completed'
      },
      { type: 'tool-result', callId: 'pwd', output: '/workspace/orca', isError: false },
      {
        type: 'tool-call',
        callId: 'status',
        name: 'shell',
        input: { command: 'git status --short' },
        state: 'completed'
      },
      { type: 'tool-result', callId: 'status', output: 'clean working tree', isError: false }
    ],
    timestamp: 3,
    source: 'transcript'
  },
  {
    id: 'roster',
    role: 'assistant',
    blocks: [{ type: 'subagent-group', groupId: 'spawn', agents: [child] }],
    timestamp: 4,
    source: 'transcript'
  },
  {
    id: 'child-output',
    agentId: 'research',
    role: 'assistant',
    blocks: [{ type: 'text', text: 'The child found the queue capability mismatch.' }],
    timestamp: 5,
    source: 'transcript'
  },
  {
    id: 'nested-roster',
    agentId: 'research',
    role: 'assistant',
    blocks: [{ type: 'subagent-group', groupId: 'nested-spawn', agents: [nested] }],
    timestamp: 6,
    source: 'transcript'
  },
  {
    id: 'nested-output',
    agentId: 'review',
    parentAgentId: 'research',
    role: 'assistant',
    blocks: [{ type: 'text', text: 'The independent review confirmed the finding.' }],
    timestamp: 7,
    source: 'transcript'
  },
  {
    id: 'final',
    role: 'assistant',
    blocks: [
      {
        type: 'text',
        text: 'The investigation is complete. The result remains available for inspection.'
      }
    ],
    timestamp: 8,
    source: 'transcript'
  }
]
const roster: StructuredAgentSubagentRoster = new Map(
  [child, nested].map((entry, i) => [
    entry.id,
    {
      entry,
      rosterItemId: `roster-${i}`,
      rosterPosition: { sequence: i + 1, index: 0 },
      rosterRevision: 1
    }
  ])
)
const session: NativeChatLiveSession = {
  agent: 'codex',
  sessionId: 'fixture',
  status: 'ready',
  messages,
  hasMore: false,
  loadingEarlier: false,
  olderHistoryGeneration: 0,
  loadEarlier: async () => 'exhausted',
  readPhase: 'ready',
  readCurrent: true
}

function Fixture() {
  useTranslation()
  const [dark, setDark] = useState(true)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  const [russian, setRussian] = useState(false)
  const navigator = useNativeChatChildNavigator('fixture')
  return (
    <TooltipProvider>
      <NativeChatChildNavigationContext.Provider value={navigator.navigation}>
        <main
          className={
            dark
              ? 'dark flex h-screen flex-col bg-background text-foreground'
              : 'flex h-screen flex-col bg-background text-foreground'
          }
        >
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
            <span className="min-w-0 truncate text-sm font-medium">
              Orca · Conversation workflow
            </span>
            <Button variant="ghost" size="xs" onClick={() => setDark(!dark)}>
              Toggle theme
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={async () => {
                await setRendererUiLanguage(russian ? 'en' : 'ru')
                setRussian(!russian)
              }}
            >
              {russian ? 'English' : 'Русский'}
            </Button>
          </div>
          <div
            className="native-chat-appearance flex min-h-0 flex-1 flex-col"
            style={nativeChatAppearanceStyle({ theme: dark ? 'dark' : 'light' })}
          >
            <div
              hidden={navigator.child !== null}
              inert={navigator.child !== null}
              className={navigator.child ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}
            >
              {view === 'workers' ? (
                <NativeChatSessionChildren
                  sessionId="fixture"
                  target={{ kind: 'local' }}
                  isVisible={navigator.child === null}
                />
              ) : null}
              <NativeChatMessageList
                session={session}
                subagentRoster={roster}
                isVisible={navigator.child === null}
                isWorking={false}
                expandSignal={false}
              />
              <QueueFixture />
            </div>
            {navigator.child ? (
              <NativeChatChildTranscriptStack
                path={navigator.path}
                onBack={navigator.back}
                session={session}
                roster={roster}
                isVisible
              />
            ) : null}
          </div>
        </main>
      </NativeChatChildNavigationContext.Provider>
    </TooltipProvider>
  )
}
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    view === 'settings' ? (
      <TooltipProvider>
        <SettingsFixture />
      </TooltipProvider>
    ) : (
      <Fixture />
    )
  )
}
