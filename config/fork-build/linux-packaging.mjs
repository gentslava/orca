import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const architecture = process.argv[2]
if (
  process.platform !== 'linux' ||
  !['x64', 'arm64'].includes(architecture) ||
  process.arch !== architecture
) {
  throw new Error('Linux packages require a native runner matching their architecture')
}
const application = process.cwd()
const require = createRequire(join(application, 'package.json'))
const { spawnProcess } = await import(pathToFileURL(require.resolve('@orca/process-host')).href)
const { packageLinuxFormats } = await import(
  pathToFileURL(resolve('config/scripts/desktop-distribution/linux/package-linux-formats.mjs')).href
)
const configuration = fileURLToPath(new URL('./linux-builder.config.cjs', import.meta.url))

await packageLinuxFormats({
  preparedDirectory: resolve(
    'dist',
    architecture === 'x64' ? 'linux-unpacked' : 'linux-arm64-unpacked'
  ),
  ...(architecture === 'arm64' ? { prepareAppImageTools: async () => ({}) } : {}),
  runBuilder: (args, environment) => {
    if (
      args[0] !== '--config' ||
      args[1] !== 'config/electron-builder-pr-linux.config.cjs' ||
      args.filter((arg) => arg === '--x64').length !== 1
    ) {
      throw new Error('Upstream Linux format invocation changed; review the package adapter')
    }
    const adapted = args.map((arg, index) =>
      index === 1 ? configuration : arg === '--x64' ? `--${architecture}` : arg
    )
    return new Promise((resolveBuild, reject) => {
      const child = spawnProcess({
        program: process.execPath,
        args: [require.resolve('electron-builder/cli.js'), ...adapted],
        env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1', ...environment },
        stdio: 'inherit'
      })
      child.once('error', reject)
      child.once('close', (code, signal) => {
        if (code === 0 && signal === null) {
          resolveBuild()
        } else {
          reject(new Error(`Linux format packaging failed (code=${code}, signal=${signal})`))
        }
      })
    })
  }
})
