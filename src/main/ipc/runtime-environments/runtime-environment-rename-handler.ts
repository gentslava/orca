import {
  renameEnvironment,
  resolveEnvironment
} from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { redactRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'

export function renameSavedRuntimeEnvironment(
  userDataPath: string,
  args: { selector: string; name: string }
) {
  const environment = resolveEnvironment(userDataPath, args.selector)
  const renamed = renameEnvironment(userDataPath, environment.id, { name: args.name })
  return {
    environment: redactRuntimeEnvironment({
      ...environment,
      name: renamed.name,
      updatedAt: renamed.updatedAt
    })
  }
}
