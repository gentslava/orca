import { observeAcpForkSupport } from '../capabilities/acp-fork-support'
import {
  assertStructuredAgentResolutionCurrent,
  type StructuredAgentResolutionOperation
} from '../../native-chat/structured-agent-command-resolution'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentCliVersionReader } from '../../agent-launch/preflight/agent-cli-version-probe'
import type { AgentModelCatalogProbe } from '../../native-chat/agent-model-catalog/agent-model-catalog-store'
import {
  AgentModelCatalogProbeError,
  runAgentModelCatalogListing,
  runAgentModelCatalogSession
} from '../../native-chat/agent-model-catalog/agent-model-catalog-probe-runner'
import { AgentModelCatalogListingStoppedError } from '../../native-chat/agent-model-catalog/agent-model-catalog-failures'
import type { ProviderProcessLaunch } from '../../provider-process/provider-process-launch'
import type { AgentSessionModelOption } from '../../../shared/agent-session/agent-session-wire'
import { createAcpAgentConnection } from '../process/acp-agent-connection'
import { acpLaunchSpecForAccount } from '../launch/acp-launch-command'
import { acpRunFolder } from '../launch/acp-private-temp'
import {
  acpListingDependsOnRelease,
  acpListingNeedsChatFolder,
  acpModelListingForRelease,
  type AcpSessionModelDiscovery
} from './acp-model-discovery-policy'
import type { AcpLaunchSpec } from '../launch/acp-launch-contract'
import type { AcpSessionStarted, AcpSessionStartOptions } from '../protocol/acp-session-setup'
import { checkAcpLaunchVersion } from '../launch/acp-launch-version'
import {
  resolveAcpLaunchInvocation,
  type AcpLaunchInvocationDeps
} from '../launch/acp-structured-launch-resolution'
import { AcpStructuredOptions } from '../options/acp-structured-options'
import type {
  InitializeResponse,
  SetSessionConfigOptionResponse
} from '../generated/acp-protocol.generated'
import { withTimeout } from '../../../shared/promise-timeout-fallback'
import { AcpAgentError } from '../transport/acp-errors'
import { AgentModelCatalogUnavailableError } from '../../native-chat/agent-model-catalog/agent-model-catalog-unavailable'

/** Session-free capability boundary: no session methods are exposed. */
export type AcpModelCatalogConnection = {
  initialize(): Promise<InitializeResponse>
  requestSessionFreeExtension(method: string, params: unknown): Promise<unknown>
  close(): Promise<unknown>
}

export type AcpModelCatalogSessionConnection = Omit<
  AcpModelCatalogConnection,
  'requestSessionFreeExtension'
> & {
  start(options: AcpSessionStartOptions): Promise<AcpSessionStarted>
  setConfigOption(configId: string, value: string): Promise<SetSessionConfigOptionResponse>
  deleteSession(sessionId: string): Promise<unknown>
}

export type AcpModelCatalogProbeDeps = AcpLaunchInvocationDeps & {
  probeVersion?: AgentCliVersionReader
  connect?: (launch: ProviderProcessLaunch) => AcpModelCatalogConnection
  connectSession?: (launch: ProviderProcessLaunch) => AcpModelCatalogSessionConnection
  runListing?: typeof runAgentModelCatalogListing
}

/** Uses the same binary, account and scrubbed environment as chats. */
export function createAcpModelCatalogProbe(
  spec: AcpLaunchSpec,
  deps: AcpModelCatalogProbeDeps
): AgentModelCatalogProbe {
  const probe: AgentModelCatalogProbe = async (accountHome, options) => {
    const operation = options?.operation ?? { signal: options?.signal }
    assertStructuredAgentResolutionCurrent(operation)
    const activeSpec = acpLaunchSpecForAccount(spec, accountHome)
    const discovery = activeSpec.modelDiscovery
    if (discovery.kind === 'unavailable') {
      throw new Error(discovery.reason)
    }
    const workspace = options?.workspacePath
    // Reject folderless session discovery before spawning even a version probe.
    if (!workspace && acpListingNeedsChatFolder(discovery)) {
      throw folderlessListing(activeSpec)
    }
    // Start in home; only explicit chat-folder discovery reads project config.
    const cwd = deps.homePath ?? homedir()
    const { command, prefixArgs, env, envToDelete } = await resolveAcpLaunchInvocation(
      spec,
      accountHome,
      {
        ...deps,
        operation,
        resolveWorkingDirectory: () => cwd
      }
    )
    assertStructuredAgentResolutionCurrent(operation)
    const release = await checkAcpLaunchVersion(
      activeSpec,
      { command, prefixArgs, cwd, env },
      acpListingDependsOnRelease(discovery),
      deps.probeVersion
    )
    assertStructuredAgentResolutionCurrent(operation)
    if (release.status === 'tooOld') {
      throw new Error(`${activeSpec.agent} at ${command} does not run structured chats`)
    }
    const listing = acpModelListingForRelease(discovery, release.version)
    if (listing === null) {
      throw new Error(`${activeSpec.agent} at ${command} lists its models only through its chats`)
    }
    const launch = {
      command,
      args: [...prefixArgs, ...activeSpec.args({ fullAccess: false, pluginDir: null })],
      cwd,
      env,
      envToDelete
    }
    const run = { label: activeSpec.agent, signal: options?.signal }
    let models: AgentSessionModelOption[]
    let attemptedModels: string[] | undefined
    if (listing.kind === 'command') {
      const stdout = await (deps.runListing ?? runAgentModelCatalogListing)(
        {
          command,
          args: [...prefixArgs, ...listing.args],
          cwd: workspace ?? cwd,
          env,
          envToDelete
        },
        { site: `${activeSpec.agent}-model-catalog-probe`, signal: options?.signal }
      )
      models = listing.parse(stdout)
      if (models.length === 0 && listing.isNotSignedInOutput?.(stdout)) {
        const account = activeSpec.dialect.signInAccount
        throw new AgentModelCatalogUnavailableError({
          reason: 'notSignedIn',
          ...(account ? { account } : {})
        })
      }
    } else if (listing.kind === 'session') {
      if (!workspace) {
        throw folderlessListing(activeSpec)
      }
      // Remove disposable session storage after the process closes.
      const folderArgs = listing.sessionFolderArgs
      const folder = folderArgs
        ? await acpRunFolder(join(deps.dataDirectory, 'acp-listing-sessions', activeSpec.agent))
        : null
      try {
        assertStructuredAgentResolutionCurrent(operation)
        const args =
          folderArgs && folder ? [...launch.args, ...folderArgs(folder.path)] : launch.args
        const result = await runAgentModelCatalogSession(
          () => (deps.connectSession ?? createAcpAgentConnection)({ ...launch, args }),
          (connection, ready) =>
            readSessionModels(
              activeSpec,
              listing,
              connection,
              workspace,
              operation,
              options?.selectedModels,
              activeSpec.dialect.effortChangesModel ? ready : undefined
            ),
          run
        )
        models = result.models
        attemptedModels = result.attemptedModels
      } finally {
        await folder?.remove()
      }
    } else {
      models = await runAgentModelCatalogSession(
        () => (deps.connect ?? createAcpAgentConnection)(launch),
        async (connection) => {
          const initialized = await connection.initialize()
          assertStructuredAgentResolutionCurrent(operation)
          observeAcpForkSupport(activeSpec.agent, initialized)
          return listing.read(initialized, connection)
        },
        run
      )
    }
    if (models.length === 0) {
      throw new Error(`${activeSpec.agent} listed no models`)
    }
    return { models, origin: 'probe', ...(attemptedModels ? { attemptedModels } : {}) }
  }
  return Object.assign(
    async (
      home: Parameters<AgentModelCatalogProbe>[0],
      options?: Parameters<AgentModelCatalogProbe>[1]
    ) => {
      try {
        return await probe(home, options)
      } catch (error) {
        const activeSpec = acpLaunchSpecForAccount(spec, home)
        const account = activeSpec.dialect.signInAccount
        const commandSignedOut =
          error instanceof AgentModelCatalogProbeError &&
          (error.reason === 'exit' || error.reason === 'timeout') &&
          error.failedExit !== undefined &&
          activeSpec.modelDiscovery.kind === 'command' &&
          activeSpec.modelDiscovery.isNotSignedInOutput?.(
            `${error.failedExit.stdout}\n${error.failedExit.stderr}`
          ) === true
        if ((error instanceof AcpAgentError && error.code === -32000) || commandSignedOut) {
          throw new AgentModelCatalogUnavailableError({
            reason: 'notSignedIn',
            ...(account ? { account } : {})
          })
        }
        throw error
      }
    },
    {
      supportsAccount: (home: Parameters<AgentModelCatalogProbe>[0]) =>
        acpLaunchSpecForAccount(spec, home).modelDiscovery.kind !== 'unavailable'
    }
  )
}

const folderlessListing = (spec: AcpLaunchSpec) =>
  new AgentModelCatalogListingStoppedError(`${spec.agent} lists in a chat's folder`)

async function readSessionModels(
  spec: AcpLaunchSpec,
  listing: AcpSessionModelDiscovery,
  connection: AcpModelCatalogSessionConnection,
  workspace: string,
  operation?: StructuredAgentResolutionOperation,
  selectedModels?: readonly string[],
  ready?: (cleanup: () => Promise<unknown>) => void
): Promise<{ models: AgentSessionModelOption[]; attemptedModels: string[] }> {
  const initialized = await connection.initialize()
  assertStructuredAgentResolutionCurrent(operation)
  observeAcpForkSupport(spec.agent, initialized)
  const deletes = Boolean(initialized.agentCapabilities?.sessionCapabilities?.delete)
  if (!deletes && !listing.sessionFolderArgs) {
    throw new Error(`${spec.agent} cannot delete a session, so it lists its models only in chats`)
  }
  const started = await connection.start({ cwd: workspace, mcpServers: [] })
  let stopped = false
  const cleanup = async (): Promise<void> => {
    stopped = true
    if (deletes) {
      await connection.deleteSession(started.sessionId).catch((error: unknown) => {
        console.warn(`[acp-model-catalog] ${spec.agent} kept its listing session:`, error)
      })
    }
  }
  // Startup and menu discovery have separate budgets; cleanup also runs on cancellation.
  ready?.(cleanup)
  const options = new AcpStructuredOptions(spec.dialect)
  options.adoptSession(started.response, 'new')
  let models = options.read().models
  const attemptedModels: string[] = []
  try {
    if (spec.dialect.effortChangesModel) {
      const byId = new Map(models.map((model) => [model.id, model]))
      const targets = selectedModels ? selectedModels.flatMap((id) => byId.get(id) ?? []) : models
      const sweep = async () => {
        for (const model of targets) {
          if (stopped) {
            return
          }
          assertStructuredAgentResolutionCurrent(operation)
          if (model.effortsKnown !== false) {
            continue
          }
          attemptedModels.push(model.id)
          try {
            for (let attempt = 0; attempt < 2 && !stopped; attempt++) {
              const write = options.write('model', model.id)
              if (write?.method !== 'config') {
                break
              }
              const reply = await connection.setConfigOption(write.configId, write.value)
              if (stopped) {
                return
              }
              assertStructuredAgentResolutionCurrent(operation)
              options.adoptConfigOptions(reply.configOptions)
              const observed = options.read()
              if (observed.current.model !== model.id) {
                continue
              }
              const known = observed.models.find((row) => row.id === model.id)
              if (known) {
                models = models.map((row) => (row.id === model.id ? known : row))
              }
              break
            }
          } catch {
            assertStructuredAgentResolutionCurrent(operation)
          }
        }
      }
      await withTimeout(sweep(), 5_000, undefined)
    }
    assertStructuredAgentResolutionCurrent(operation)
    return { models, attemptedModels }
  } finally {
    if (!ready) {
      await cleanup()
    }
  }
}
