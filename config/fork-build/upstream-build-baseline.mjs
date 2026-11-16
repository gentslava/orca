import { isAncestor } from './composition.mjs'

export function selectUpstreamBuildCommit(observed, requested) {
  const selected = requested?.trim() || observed
  if (!/^[a-f0-9]{40}$/.test(selected)) {
    throw new Error('Upstream build baseline must be a full commit SHA')
  }
  return selected
}

export function requireUpstreamBuildAncestor(cwd, selected, observed) {
  if (!isAncestor(cwd, selected, observed)) {
    throw new Error('Requested build baseline is not in the observed upstream history')
  }
}
