import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { isAiVaultScanCancelledError } from '../../../../../../shared/ai-vault/contracts/ai-vault-types'
import type { useAppliedAiVaultScan } from './ai-vault-applied-scan'
import type { AiVaultSessionPublicationGate } from './ai-vault-session-publication-gate'
import {
  aiVaultSessionListArgs,
  type AiVaultSessionListRequest
} from './ai-vault-session-list-request'

export function useAiVaultStartupCatalog(
  applyScan: ReturnType<typeof useAppliedAiVaultScan>['applyScan'],
  gate: RefObject<AiVaultSessionPublicationGate>,
  setLoading: Dispatch<SetStateAction<boolean>>
) {
  const scope = useRef<string | null>(null)
  return useCallback(
    (
      request: AiVaultSessionListRequest,
      requestToken: string,
      scopeKey: string,
      current: () => boolean
    ): Promise<void> | undefined => {
      if (!request.includeStructuredSessions || scope.current === scopeKey) {
        return
      }
      scope.current = scopeKey
      return (async () => {
        try {
          const catalog = await window.api.aiVault.listSessions({
            ...aiVaultSessionListArgs(request, { requestToken }),
            executionHostScope:
              request.executionHostScope === 'all' ? 'local' : request.executionHostScope,
            structuredOnly: true
          })
          if (current() && !catalog.cancelled && catalog.sessions.length > 0) {
            gate.current.publish(catalog, (published) => {
              if (current()) {
                applyScan({
                  result: published,
                  limit: request.sessionLimit,
                  scopeKey,
                  scopeOnly: request.scopeOnly === true
                })
                setLoading(false)
              }
            })
          }
        } catch (error) {
          if (!isAiVaultScanCancelledError(error)) {
            console.warn('Could not load the chat catalog before history', error)
          }
        }
      })()
    },
    [applyScan, gate, setLoading]
  )
}
