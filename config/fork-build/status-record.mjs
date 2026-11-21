export function nextRecord(current, plan, { runId, attempt, publication, branchSync }) {
  if (Number(current.runId || 0) > Number(runId)) {
    return null
  }
  const lastGood =
    publication === 'success'
      ? {
          tag: `personal-${runId}-${attempt}`,
          fingerprint: plan.fingerprint,
          commit: plan.result.commit,
          promoted: branchSync === 'success'
        }
      : current.lastGood
  return {
    schemaVersion: 1,
    runId,
    tracked: [...new Set([...(current.tracked || []), ...(plan?.tracked || [])])].sort(
      (a, b) => a - b
    ),
    ...(lastGood ? { lastGood } : {})
  }
}
