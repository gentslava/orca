import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime/client'
import { CHAT_HANDLERS } from './chat'

const SESSION = 'chat-7'

function chatClient(): { client: RuntimeClient; call: ReturnType<typeof vi.fn> } {
  const client = new RuntimeClient('/tmp/orca-chat-test', 60_000, null, null)
  vi.spyOn(client, 'isRemote', 'get').mockReturnValue(false)
  const call = vi.fn()
  vi.spyOn(client, 'call').mockImplementation(call)
  return { client, call }
}

function close(client: RuntimeClient, session?: string): Promise<void> {
  return CHAT_HANDLERS['chat close']({
    flags: new Map(session === undefined ? [] : [['session', session] as const]),
    client,
    cwd: '/tmp/worktree',
    json: true
  })
}

describe('chat close CLI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('never closes the chat it runs in without --session', async () => {
    vi.stubEnv('ORCA_AGENT_SESSION_ID', 'chat-7')
    const { client, call } = chatClient()

    await expect(close(client)).rejects.toThrow('Missing required --session')
    expect(call).not.toHaveBeenCalled()
  })

  it('fails when the host has no chat with that session id', async () => {
    const { client, call } = chatClient()
    call.mockResolvedValueOnce({ id: 'req-close', ok: true, result: { ok: true, found: false } })

    await expect(close(client, 'chat-gone')).rejects.toThrow(
      'No chat with session id chat-gone on this host.'
    )
    expect(call).toHaveBeenCalledWith('agentSession.close', { sessionId: 'chat-gone' })
  })

  it('does not claim a confirmed close when an older host omits the found result', async () => {
    const { client, call } = chatClient()
    call.mockResolvedValueOnce({ id: 'req-close', ok: true, result: { ok: true } })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await CHAT_HANDLERS['chat close']({
      flags: new Map([['session', SESSION]]),
      client,
      cwd: '/tmp',
      json: false
    })

    expect(log).toHaveBeenCalledWith(
      `Requested close of chat ${SESSION}; this older host does not confirm the session was found.`
    )
  })

  it.each([undefined, true])('reports host confirmation in JSON: %s', async (found) => {
    const { client, call } = chatClient()
    call.mockResolvedValueOnce({
      id: 'req-close',
      ok: true,
      result: { ok: true, ...(found === true ? { found } : {}) }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await close(client, SESSION)

    expect(JSON.parse(log.mock.calls[0][0]).result).toMatchObject({
      ok: true,
      confirmed: found === true
    })
  })
})
