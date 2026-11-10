export function indexById(byBucket: ReadonlyMap<string, readonly string[]>): Map<string, number> {
  const map = new Map<string, number>()
  for (const ids of byBucket.values()) {
    ids.forEach((id, index) => {
      map.set(id, index)
    })
  }
  return map
}

export function bucketById(byBucket: ReadonlyMap<string, readonly string[]>): Map<string, string> {
  const map = new Map<string, string>()
  for (const [bucketKey, ids] of byBucket) {
    for (const id of ids) {
      map.set(id, bucketKey)
    }
  }
  return map
}
