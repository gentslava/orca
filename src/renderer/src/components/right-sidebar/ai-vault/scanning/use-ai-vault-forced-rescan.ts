import { useCallback, useEffect, useRef } from 'react'
import { claimAiVaultForcedRescan, aiVaultForcedRescanDelay } from './ai-vault-forced-rescan-budget'

export function useAiVaultForcedRescan(
  refresh: (args: { background: boolean; force: boolean }) => Promise<void>
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestForcedRescan = useCallback(() => {
    if (claimAiVaultForcedRescan()) {
      void refresh({ background: true, force: true })
      return
    }
    if (timer.current !== null) {
      return
    }
    timer.current = setTimeout(() => {
      timer.current = null
      requestForcedRescan()
    }, aiVaultForcedRescanDelay())
  }, [refresh])

  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current)
        timer.current = null
      }
    },
    []
  )
  return requestForcedRescan
}
