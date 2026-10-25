import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertMacGuiLaunchAllowed } from './macos-gui-launch-preflight.mjs'

describe('macOS GUI launch preflight', () => {
  it.skipIf(process.platform !== 'darwin')(
    'dev runner exits before preparing or starting Electron',
    () => {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('./run-electron-vite-dev.mjs', import.meta.url))],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            CODEX_SANDBOX: 'seatbelt',
            ORCA_BACKGROUND_LAUNCH: '1',
            ORCA_ELECTRON_VITE_CLI: 'must-not-launch.mjs'
          }
        }
      )
      expect(result.signal).toBeNull()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('outside the Codex sandbox')
      expect(result.stderr).not.toContain('must-not-launch')
      expect(result.stdout).not.toContain('Prepared wrapper')
    }
  )

  it('refuses a hidden Electron launch in the Codex seatbelt before native startup', () => {
    expect(() =>
      assertMacGuiLaunchAllowed({
        platform: 'darwin',
        env: {
          CODEX_SANDBOX: 'seatbelt',
          ORCA_BACKGROUND_LAUNCH: '1',
          ORCA_E2E_HEADLESS: '1'
        }
      })
    ).toThrow(/outside the Codex sandbox/)
  })

  it('permits an approved macOS launch outside seatbelt', () => {
    expect(() =>
      assertMacGuiLaunchAllowed({
        platform: 'darwin',
        env: {
          ORCA_BACKGROUND_LAUNCH: '1'
        }
      })
    ).not.toThrow()
  })

  it.each(['linux', 'win32'])('does not apply macOS launch restrictions on %s', (platform) => {
    expect(() =>
      assertMacGuiLaunchAllowed({
        platform,
        env: {
          CODEX_SANDBOX: 'seatbelt'
        }
      })
    ).not.toThrow()
  })
})
