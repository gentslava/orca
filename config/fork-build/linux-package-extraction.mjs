import { execFileSync } from 'node:child_process'
import { chmodSync, closeSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import staticAppImage from '../scripts/desktop-distribution/appimage/static-appimage-package-contract.cjs'

export function extractLinuxPackage(file, format, directory, architecture) {
  if (process.platform !== 'linux' || process.arch !== architecture) {
    throw new Error('Linux extraction requires the native planned runner')
  }
  mkdirSync(directory, { recursive: true })
  const options = { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }
  if (format === 'AppImage') {
    chmodSync(file, 0o755)
    staticAppImage.verifyStaticAppImagePackage(file, architecture)
    execFileSync(file, ['--appimage-extract'], options)
    return join(directory, 'squashfs-root')
  }
  if (format === 'deb') {
    execFileSync('dpkg-deb', ['--extract', file, directory], options)
  } else if (format === 'rpm') {
    const archive = join(directory, 'contents.cpio')
    let descriptor = openSync(archive, 'wx')
    try {
      execFileSync('rpm2cpio', [file], { ...options, stdio: ['ignore', descriptor, 'pipe'] })
    } finally {
      closeSync(descriptor)
    }
    descriptor = openSync(archive, 'r')
    try {
      execFileSync('cpio', ['-idm', '--no-absolute-filenames'], {
        ...options,
        stdio: [descriptor, 'pipe', 'pipe']
      })
    } finally {
      closeSync(descriptor)
    }
  } else {
    throw new Error('Unsupported Linux package format')
  }
  return join(directory, 'opt', 'Orca')
}
