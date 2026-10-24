import assert from 'node:assert/strict'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JournalHostDatabase } from '../../../src/main/native-chat/agent-session-journal/journal-host-database.ts'
import { openAgentSessionJournal } from '../../../src/main/native-chat/agent-session-journal/journal-store-factory.ts'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../../src/shared/agent-session-journal-types.ts'
import { codexProviderHandle } from '../../../src/shared/agent-session-provider-handle-encoding.ts'
import { createOrcadSecretStore } from '../../../src/main/orcad/orcad-secret-store.ts'
import { resolveStructuredAgentCommand } from '../../../src/main/native-chat/structured-agent-command-resolution.ts'

async function main() {
  const create = process.argv.includes('--create')
  const state = process.env.ORCA_USER_DATA
  const home = process.env.HOME
  if (state !== '/var/lib/orca' || home !== '/home/node' || process.getuid?.() !== 1000) {
    throw new Error('fixture requires the isolated Docker service volumes and user')
  }
  const marker = 'orcad-docker-fixture-no-provider-account'
  const providers = JSON.parse(await readFile('/opt/orca/providers/manifest.json', 'utf8'))
  const claude = providers.find((provider) => provider.package === '@anthropic-ai/claude-code')
  assert.ok(claude)
  const claudeCommand = resolveStructuredAgentCommand('claude', {})
  assert.equal(await realpath(claudeCommand), claude.binary)
  const keyDir = join(home, '.orca')
  await mkdir(keyDir, { recursive: true, mode: 0o700 })
  const secrets = createOrcadSecretStore()
  assert.equal(await secrets.prepare({ keyDir, userDataPath: state }), true)
  const file = join(keyDir, 'docker-fixture.sealed')
  if (create) {
    await writeFile('/workspaces/docker-fixture.txt', marker)
    await writeFile(file, secrets.encryptString(marker), { mode: 0o600 })
    const sessions = join(home, '.codex', 'sessions', '2026', '10', '24')
    await mkdir(sessions, { recursive: true })
    const tokens = {
      input_tokens: 1000,
      cached_input_tokens: 900,
      output_tokens: 200,
      reasoning_output_tokens: 150,
      total_tokens: 1200
    }
    const transcript = [
      { type: 'session_meta', payload: { id: 'usage-fixture', cwd: '/workspaces' } },
      { type: 'turn_context', payload: { cwd: '/workspaces', model: 'gpt-5.4' } },
      {
        timestamp: '2026-10-24T10:00:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { total_token_usage: tokens, last_token_usage: tokens }
        }
      }
    ]
    await writeFile(
      join(sessions, 'rollout-fixture.jsonl'),
      `${transcript.map((row) => JSON.stringify(row)).join('\n')}\n`
    )
  }
  assert.equal(await readFile('/workspaces/docker-fixture.txt', 'utf8'), marker)
  assert.equal(secrets.decryptString(await readFile(file)), marker)
  const database = JournalHostDatabase.open(join(state, 'docker-fixture-journal'))
  const journal = await openAgentSessionJournal({
    database,
    identity: {
      sessionId: 'docker-fixture',
      workspaceId: '/workspaces',
      hostId: 'docker-fixture',
      agent: 'codex',
      providerHandle: codexProviderHandle('fixture-thread')
    }
  })
  try {
    if (create) {
      await journal.appendItem(
        { provider: 'codex', threadId: 'fixture-thread', turnId: 'fixture-turn', ordinal: 0 },
        { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: marker }] },
        { fence: 1, turnScope: AGENT_JOURNAL_THREAD_SCOPE }
      )
    }
    assert.ok(
      journal
        .snapshot()
        .items.some(
          (item) =>
            item.body.kind === 'message' &&
            item.body.blocks.some((block) => block.type === 'text' && block.text === marker)
        )
    )
  } finally {
    await journal.close()
    database.close()
  }
  console.log(
    JSON.stringify({
      workspace: 'persisted',
      journal: 'persisted',
      sealedCredentialPlaceholder: 'decrypted',
      claudeCommand,
      machineId: (await readFile('/etc/machine-id', 'utf8')).trim()
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
