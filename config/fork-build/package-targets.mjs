import { isDeepStrictEqual } from 'node:util'

const targets = [
  {
    id: 'macos-arm64',
    platform: 'darwin',
    architecture: 'arm64',
    runner: 'macos-26',
    outputs: ['macos-arm64-dmg', 'macos-arm64-zip']
  },
  {
    id: 'windows-x64',
    receipt: 'windows',
    platform: 'win32',
    architecture: 'x64',
    runner: 'windows-2022',
    outputs: ['windows-x64-installer', 'windows-x64-zip'],
    files: ['orca-windows-setup.exe', 'orca-windows-x64.zip']
  },
  {
    id: 'android',
    platform: 'android',
    architecture: 'universal',
    runner: 'ubuntu-latest',
    outputs: ['android-apk'],
    files: ['orca-android.apk']
  },
  {
    id: 'linux-x64',
    platform: 'linux',
    architecture: 'x64',
    runner: 'ubuntu-latest',
    outputs: ['linux-x64-appimage', 'linux-x64-deb', 'linux-x64-rpm'],
    files: ['orca-linux.AppImage', 'orca-linux-x64.deb', 'orca-linux-x64.rpm']
  },
  {
    id: 'linux-arm64',
    platform: 'linux',
    architecture: 'arm64',
    runner: 'ubuntu-24.04-arm',
    outputs: ['linux-arm64-appimage', 'linux-arm64-deb', 'linux-arm64-rpm'],
    files: ['orca-linux-arm64.AppImage', 'orca-linux-arm64.deb', 'orca-linux-arm64.rpm']
  }
]

export const personalPackageOutputs = targets.flatMap((target) => target.outputs)

export function packageTargets(outputs) {
  if (!isDeepStrictEqual(outputs, personalPackageOutputs)) {
    throw new Error('Every planned platform and package format is required')
  }
  return structuredClone(targets)
}

export function linuxPackageTarget(plan, architecture) {
  const planned = packageTargets(plan.outputs)
  if (!isDeepStrictEqual(plan.targets, planned)) {
    throw new Error('Package matrix differs from the frozen output plan')
  }
  const target = planned.find(
    (item) => item.platform === 'linux' && item.architecture === architecture
  )
  if (!target) {
    throw new Error('Unplanned Linux architecture')
  }
  return target
}
