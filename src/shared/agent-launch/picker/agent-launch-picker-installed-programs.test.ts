import { expect, it } from 'vitest'
import { buildNewTabAgentMenuRows, type ChatProgramObservation } from './agent-launch-picker-rows'

it.each<{ program: ChatProgramObservation; cli: boolean; offered: boolean }>([
  { program: 'available', cli: false, offered: true },
  { program: 'installable', cli: false, offered: false },
  { program: 'missing', cli: false, offered: false },
  { program: 'installable', cli: true, offered: true }
])(
  'offers a ready program or an installed CLI: $program, CLI $cli',
  ({ program, cli, offered }) => {
    const rows = buildNewTabAgentMenuRows({
      settings: { defaultTuiAgent: 'codex', agentDefaultSurface: 'chat' },
      detectedOnHost: cli ? ['codex'] : [],
      chatAgents: ['codex'],
      hostChatAnswer: () => 'yes',
      chatProgram: () => program
    })
    expect(rows.some((row) => row.agent === 'codex' && row.kind === 'chat')).toBe(offered)
    if (!offered) {
      expect(rows).toEqual([])
    }
  }
)
