import { createBrowserUuid } from '@/lib/browser-uuid'
import { useAppStore } from '@/store'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import { PERSONAL_PROJECT_ORDER_CAPABILITY } from '../../../shared/personal-project-order'
import type { ProjectOrderBy } from '../../../shared/ui-chrome-types'
import { ensureLocalRuntimeCapabilities } from './local-runtime-capabilities'
import { callRuntimeRpc } from './runtime-rpc-client'

const writer = createBrowserUuid()
let seq = 0
let writes: Promise<unknown> = Promise.resolve()

async function supportsPersonalOrder(): Promise<boolean> {
  return (
    (await ensureLocalRuntimeCapabilities())?.includes(PERSONAL_PROJECT_ORDER_CAPABILITY) === true
  )
}

export function writePersonalProjectPreference(
  method: 'ui.recordProjectOpen' | 'ui.setProjectPinned',
  params:
    | { projectKey: string; previousProjectKey: string | null }
    | { projectKey: string; pinned: boolean }
): Promise<void> {
  const opId = { writer, seq: ++seq }
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      if (!(await supportsPersonalOrder())) {
        return
      }
      const reply = await callRuntimeRpc<{ ui: PersistedUIState }>({ kind: 'local' }, method, {
        ...params,
        opId
      })
      useAppStore.getState().hydratePersistedUI(reply.ui)
    })
  writes = write
  return write
}

export async function writeProjectOrderMode(mode: ProjectOrderBy): Promise<void> {
  if ((mode === 'name' || mode === 'frequent') && !(await supportsPersonalOrder())) {
    return
  }
  const reply = await callRuntimeRpc<{ ui: PersistedUIState }>({ kind: 'local' }, 'ui.set', {
    projectOrderBy: mode
  })
  useAppStore.getState().hydratePersistedUI(reply.ui)
}
