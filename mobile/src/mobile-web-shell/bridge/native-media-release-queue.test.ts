import { describe, expect, it, vi } from 'vitest'
import { BRIDGE_MEDIA_MAX_LIVE_HANDLES } from './bridge-media-verbs'
import { NativeMediaReleaseQueue } from './native-media-release-queue'

const FAILURE = new Error('cleanup failed')

describe('session ownership of failed cleanup', () => {
  it('drops old-session handles before a later retry', async () => {
    let session = 'a'
    const release = vi.fn(async () => {
      throw FAILURE
    })
    const queue = new NativeMediaReleaseQueue({ sessionId: () => session, release })
    await expect(queue.release('old')).rejects.toBe(FAILURE)
    session = 'b'
    await expect(queue.release('new')).rejects.toBe(FAILURE)
    release.mockClear()
    await queue.retry()
    expect(release.mock.calls).toEqual([['new']])
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores a late old-session %s for a reused handle',
    async (outcome) => {
      let session = 'a'
      const old = Promise.withResolvers<boolean>()
      let calls = 0
      let fail = true
      const release = vi.fn(async () => {
        calls += 1
        if (calls === 1) {
          return old.promise
        }
        if (fail) {
          throw FAILURE
        }
        return false
      })
      const queue = new NativeMediaReleaseQueue({ sessionId: () => session, release })
      const previous = queue.release('same').catch(() => undefined)
      session = 'b'
      await expect(queue.release('same')).rejects.toBe(FAILURE)
      if (outcome === 'resolve') {
        old.resolve(true)
      } else {
        old.reject(FAILURE)
      }
      await previous
      fail = false
      await queue.retry()
      expect(release).toHaveBeenCalledTimes(3)
      await queue.retry()
      expect(release).toHaveBeenCalledTimes(3)
    }
  )

  it('keeps a bounded pass and treats already released or expired handles as complete', async () => {
    let fail = true
    const release = vi.fn(async () => {
      if (fail) {
        throw FAILURE
      }
      return false
    })
    const queue = new NativeMediaReleaseQueue({ sessionId: () => 'a', release })
    for (let index = 0; index < BRIDGE_MEDIA_MAX_LIVE_HANDLES + 2; index += 1) {
      await expect(queue.release(`media-${index}`)).rejects.toBe(FAILURE)
    }
    release.mockClear()
    fail = false
    await queue.retry()
    expect(release).toHaveBeenCalledTimes(BRIDGE_MEDIA_MAX_LIVE_HANDLES)
    await queue.retry()
    expect(release).toHaveBeenCalledTimes(BRIDGE_MEDIA_MAX_LIVE_HANDLES)
  })

  it('does not retain cleanup without a live session', async () => {
    let session: string | null = null
    const release = vi.fn(async () => {
      throw FAILURE
    })
    const queue = new NativeMediaReleaseQueue({ sessionId: () => session, release })
    await expect(queue.release('old')).rejects.toBe(FAILURE)
    session = 'a'
    release.mockClear()
    await queue.retry()
    expect(release).not.toHaveBeenCalled()
  })
})
