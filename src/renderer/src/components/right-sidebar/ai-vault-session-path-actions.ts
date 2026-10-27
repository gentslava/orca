import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { isAiVaultSyntheticSessionPath } from '../../../../shared/ai-vault-session-deletion'
import { revealInFileManager } from '@/lib/reveal-in-file-manager'

export { isAiVaultSyntheticSessionPath as isSyntheticAiVaultSessionPath }

export function canUseLocalAiVaultSessionPathActions(
  executionHostId: ExecutionHostId | null | undefined
): boolean {
  // Electron shell APIs use this computer's paths; SSH history paths belong to the remote host.
  return normalizeExecutionHostId(executionHostId) === LOCAL_EXECUTION_HOST_ID
}

/** Open only local single-file logs until remote/synthetic sessions have provider-owned log-resource contracts. */
export function canOpenAiVaultSessionLogInOrca(
  session: Pick<AiVaultSession, 'filePath' | 'executionHostId'>
): boolean {
  const filePath = session.filePath?.trim()
  if (!filePath) {
    return false
  }
  if (!canUseLocalAiVaultSessionPathActions(session.executionHostId)) {
    return false
  }
  return !isAiVaultSyntheticSessionPath(filePath)
}

/** Reveals a session's log or cwd in the OS file manager, judged by the session's own host. */
export async function revealAiVaultSessionPath(
  session: Pick<AiVaultSession, 'executionHostId'>,
  path: string | null
): Promise<void> {
  if (path) {
    await revealInFileManager(path, session.executionHostId)
  }
}

export async function copyAiVaultSessionText(text: string, label: string): Promise<void> {
  await window.api.ui.writeClipboardText(text)
  toast.success(
    translate('auto.components.right.sidebar.AiVaultPanel.valueCopied', '{{value0}} copied', {
      value0: label
    })
  )
}
