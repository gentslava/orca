import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { quotePosixShell } from '../../shared/shell-argument-quoting'
import { generateConversationNameFromContext } from './commit-message-text-generation'

const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true })
  }
})

function writeAgent(home: string, folder: string, output: string): string {
  const bin = join(home, folder)
  mkdirSync(bin, { recursive: true })
  const file = join(bin, 'codex')
  writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' ${quotePosixShell(output)}\n`)
  chmodSync(file, 0o755)
  return file
}

describe.runIf(process.platform !== 'win32')('chat naming CLI discovery', () => {
  it('finds an nvm Codex when a GUI process PATH omits its bin directory', async () => {
    const home = mkdtempSync(join(tmpdir(), 'orca-naming-nvm-'))
    homes.push(home)
    const bin = join(home, '.nvm', 'versions', 'node', 'v24.1.0', 'bin')
    mkdirSync(bin, { recursive: true })
    symlinkSync(process.execPath, join(bin, 'node'))
    const codex = join(bin, 'codex')
    writeFileSync(codex, "#!/usr/bin/env node\nconsole.log('Fix login flow')\n")
    chmodSync(codex, 0o755)

    const result = await generateConversationNameFromContext(
      { firstPrompt: 'Fix the login flow' },
      { agentId: 'codex', model: 'default' },
      { kind: 'local', cwd: home, env: { HOME: home, PATH: '/usr/bin:/bin' } }
    )

    expect(result).toMatchObject({ success: true, name: 'Fix login flow', agentLabel: 'Codex' })
  })

  it('keeps an explicit relative recipe command ahead of discovered installs', async () => {
    const home = mkdtempSync(join(tmpdir(), 'orca-naming-relative-'))
    homes.push(home)
    writeAgent(home, 'tools', 'Local wrapper')
    writeAgent(home, '.local/bin/tools', 'Wrong install')

    const result = await generateConversationNameFromContext(
      { firstPrompt: 'Fix the login flow' },
      { agentId: 'custom', model: '', customAgentCommand: './tools/codex' },
      { kind: 'local', cwd: home, env: { HOME: home, PATH: '/usr/bin:/bin' } }
    )

    expect(result).toMatchObject({ success: true, name: 'Local wrapper' })
  })
})
