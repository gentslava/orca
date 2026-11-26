import { expect, it, vi } from 'vitest'
import { getAntigravityAccountService } from './native-account-host'
import { antigravityHostAccountHome } from './antigravity-host-acp'
import { createAntigravityHostCredentialBackend } from './native-credential-backend'
import { createEncryptedAntigravityAccountStore } from './native-account-store'
import { credential, harness } from './native-account-test-fixtures'
import { agentModelCatalogFingerprint } from '../native-chat/agent-model-catalog/agent-model-catalog-fingerprint'
import { agentModelCatalogStore } from '../native-chat/agent-model-catalog/agent-model-catalog-store'

vi.mock('./native-credential-backend', () => ({ createAntigravityHostCredentialBackend: vi.fn() }))
vi.mock('./native-account-store', () => ({ createEncryptedAntigravityAccountStore: vi.fn() }))
vi.mock('./native-wsl-credentials', () => ({ createAntigravityWslCredentialBackend: vi.fn() }))
vi.mock('../../shared/app-lifecycle/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => '/task/home' })
}))

it('retires the host agy model catalog when agy signs in to another account', async () => {
  const h = harness()
  vi.mocked(createAntigravityHostCredentialBackend).mockReturnValue(h.backend)
  vi.mocked(createEncryptedAntigravityAccountStore).mockReturnValue(h.store)
  const service = await getAntigravityAccountService({ runtime: 'host' })
  await service.addCurrentAccount()

  const hostFingerprint = agentModelCatalogFingerprint({
    agent: 'antigravity',
    accountHome: antigravityHostAccountHome('/task/home'),
    wslDistro: null
  })
  agentModelCatalogStore.recordSuccess(
    hostFingerprint,
    'antigravity',
    {
      origin: 'probe',
      models: [{ id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', isDefault: false, efforts: [] }]
    },
    'discovery'
  )
  await service.listAccounts()
  expect(agentModelCatalogStore.observation(hostFingerprint)).not.toBeNull()

  h.setNative(credential('b'))
  await service.addCurrentAccount()
  expect(agentModelCatalogStore.observation(hostFingerprint)).toBeNull()
})
