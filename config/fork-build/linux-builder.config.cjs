const { join } = require('node:path')
const base = require(join(process.cwd(), 'config/electron-builder.config.cjs'))
const architecture = process.env.ORCA_LINUX_BUILD_ARCH
if (
  !['x64', 'arm64'].includes(architecture) ||
  process.platform !== 'linux' ||
  process.arch !== architecture
) {
  throw new Error('Linux packages require their native planned runner')
}

module.exports = {
  ...base,
  linux: {
    ...base.linux,
    extraResources: [
      ...base.linux.extraResources,
      { from: join(process.cwd(), '.git/orca-personal-build.json'), to: 'orca-personal-build.json' }
    ]
  },
  deb: { ...base.deb, artifactName: `orca-linux-${architecture}.deb` },
  rpm: { ...base.rpm, artifactName: `orca-linux-${architecture}.rpm` }
}
