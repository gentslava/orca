import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { hashFile } from '../scripts/fork-upstream-archives.mjs'

export function packageIdentity(plan, platform, architecture) {
  return {
    commit: plan.result.commit,
    version: plan.version,
    configuration: plan.configuration,
    upstream: plan.upstream,
    tree: plan.result.tree,
    fingerprint: plan.fingerprint,
    platform,
    architecture
  }
}

export function assertIdentity(actual, expected) {
  if (
    Object.entries(expected).some(
      ([key, value]) => JSON.stringify(actual[key]) !== JSON.stringify(value)
    )
  ) {
    throw new Error('Package identity differs from the complete source plan')
  }
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function stagePackageFiles(directory, dist, names) {
  mkdirSync(directory, { recursive: true })
  return names.map((name) => {
    if (name !== basename(name)) {
      throw new Error('Unsafe package filename')
    }
    const sha256 = hashFile(join(dist, name))
    copyFileSync(join(dist, name), join(directory, name))
    return { file: name, sha256 }
  })
}

export function verifyPackageFiles(directory, records) {
  if (!Array.isArray(records) || !records.length) {
    throw new Error('Missing package measurements')
  }
  const names = new Set()
  for (const record of records) {
    if (
      typeof record.file !== 'string' ||
      record.file !== basename(record.file) ||
      names.has(record.file) ||
      !/^[a-f0-9]{64}$/.test(record.sha256 || '') ||
      hashFile(join(directory, record.file)) !== record.sha256
    ) {
      throw new Error('Package bytes differ from their measured proof')
    }
    names.add(record.file)
  }
}

export function writePackageReceipt(directory, prefix, proof) {
  writeJson(join(directory, `${prefix}-build-info.json`), proof)
  writeFileSync(
    join(directory, `${prefix}-SHA256SUMS`),
    `${proof.files.map(({ file, sha256 }) => `${sha256} *${file}`).join('\n')}\n`
  )
}

export function verifyPackageReceipt(directory, prefix, expected) {
  const proof = JSON.parse(readFileSync(join(directory, `${prefix}-build-info.json`), 'utf8'))
  assertIdentity(proof.identity, expected)
  verifyPackageFiles(directory, proof.files)
  const sums = `${proof.files.map(({ file, sha256 }) => `${sha256} *${file}`).join('\n')}\n`
  if (readFileSync(join(directory, `${prefix}-SHA256SUMS`), 'utf8') !== sums) {
    throw new Error('Package checksum sidecar differs from its measurements')
  }
  return proof
}
