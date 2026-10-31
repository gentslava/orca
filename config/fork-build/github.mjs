import { execFileSync } from 'node:child_process'

export function api(path, data) {
  const args = ['api', path]
  if (data) {
    args.push('--method', 'PATCH', '--input', '-')
  }
  return JSON.parse(
    execFileSync('gh', args, {
      encoding: 'utf8',
      input: data ? JSON.stringify(data) : undefined,
      stdio: ['pipe', 'pipe', 'pipe']
    })
  )
}

export function readLedger(body = '') {
  const match = body.match(/<!-- orca-personal-ledger\n([\s\S]*?)\n-->/)
  return match ? JSON.parse(match[1]) : { tracked: [] }
}

export function renderReport(plan) {
  const lines = [
    '# Orca personal build',
    '',
    `Run: ${plan.runUrl}`,
    '',
    `Configuration: \`${plan.configuration}\``,
    `Upstream: \`${plan.upstream || 'unresolved'}\``,
    `Composition: **${plan.result?.publishable ? 'ready' : 'blocked'}**`,
    `Requested mode: ${plan.auditOnly ? 'audit only' : 'build'}`,
    ''
  ]
  if (plan.error) {
    lines.push(`Planning error: ${plan.error}`, '')
  }
  if (plan.result) {
    lines.push(
      `Source commit: \`${plan.result.commit}\``,
      `Source tree: \`${plan.result.tree}\``,
      '',
      '## Selection',
      '',
      '| PR | State | Frozen head |',
      '| --- | --- | --- |'
    )
    for (const pr of plan.selections) {
      lines.push(
        `| [#${pr.number}](https://github.com/${plan.repository}/pull/${pr.number}) | ${pr.merged_at ? 'merged (ancestry checked)' : pr.draft ? 'open draft' : 'open'} | \`${pr.head.sha}\` |`
      )
    }
    lines.push('', '## Conflicts and blockers', '')
    for (const conflict of plan.result.conflicts) {
      lines.push(
        `- #${conflict.number}: **${conflict.kind}** conflict; ${conflict.paths.map((path) => `\`${path}\``).join(', ')}. Prior integrated PRs: ${conflict.preceding.join(', ') || 'none'}.`
      )
    }
    for (const blocker of [...plan.blockers, ...plan.result.blockers]) {
      lines.push(`- ${blocker.number ? `#${blocker.number}: ` : ''}${blocker.reason}`)
    }
    if (plan.result.publishable) {
      lines.push(
        'All required selected changes composed successfully. This does not yet establish a successful package build.'
      )
    }
    lines.push(
      '',
      `Already supplied by upstream: ${plan.result.suppliedByUpstream.map((n) => `#${n}`).join(', ') || 'none'}.`
    )
  }
  lines.push('', '## Lifecycle', '')
  for (const entry of plan.lifecycle || []) {
    lines.push(
      `- #${entry.number}: ${entry.disposition}${entry.replacement ? ` → #${entry.replacement}` : ''}${entry.reason ? ` — ${entry.reason}` : ''}`
    )
  }
  lines.push(
    '',
    'No required conflict is silently skipped for publication. Previous successful release remains available. Reports and artifacts identify the exact source; a clean merge is not runtime acceptance.',
    ''
  )
  return lines.join('\n')
}
