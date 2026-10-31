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
    '## Install on your Mac',
    '',
    'These personal builds use ad hoc signatures. Browser downloads may be blocked by macOS quarantine; a paid Apple Developer account is not needed for the verified local installation below.',
    '',
    'From an updated checkout of `gentslava/orca`, run this in Terminal:',
    '',
    '```sh',
    'node config/fork-build/install.mjs --wait --launch',
    '```',
    '',
    'Quit Orca completely when prompted. The installer verifies the published download digest, embedded source identity, complete app manifest and signature, installs without propagating quarantine, and retains the previous application as a backup. It does not change global Gatekeeper settings.',
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
    if (plan.result.localeMerges?.length) {
      lines.push('', '## Translation catalog merges', '')
      for (const entry of plan.result.localeMerges) {
        lines.push(
          `- #${entry.number}: independent keys merged in ${entry.paths.map((path) => `\`${path}\``).join(', ')}.`
        )
      }
    }
    if (plan.result.reviewedResolutions?.length) {
      lines.push('', '## Reviewed integration patches', '')
      for (const entry of plan.result.reviewedResolutions) {
        for (const patch of entry.patches) {
          lines.push(
            `- #${entry.number}: \`${patch.path}\`; patch SHA-256 \`${patch.patchSha256}\`. ${patch.reason}`
          )
        }
      }
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
