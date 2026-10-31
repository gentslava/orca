import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { api, readLedger } from './github.mjs'
import { nextRecord } from './status-record.mjs'

const config = JSON.parse(readFileSync(join(import.meta.dirname, 'selection.json'), 'utf8'))
const directory = process.argv[2]
const path = `repos/${process.env.GITHUB_REPOSITORY}/issues/${config.statusIssue}`
const current = readLedger(api(path).body)
const plan = existsSync(join(directory, 'plan.json'))
  ? JSON.parse(readFileSync(join(directory, 'plan.json'), 'utf8'))
  : null
const ledger = nextRecord(current, plan || { tracked: config.seed }, {
  runId: process.env.GITHUB_RUN_ID,
  attempt: process.env.GITHUB_RUN_ATTEMPT,
  publication: process.env.PUBLICATION
})
if (!ledger) {
  process.exit(0)
}
const { lastGood } = ledger
const report = existsSync(join(directory, 'report.md'))
  ? readFileSync(join(directory, 'report.md'), 'utf8')
  : `Planning failed before a receipt was produced. See [Actions](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}).`
const body = `${report}\n\nPackage job: **${process.env.PACKAGE_RESULT}**. Publication: **${process.env.PUBLICATION}**.${plan?.reuse ? ' Inputs unchanged; reusing last successful release.' : ''}\n\n${lastGood ? `Last successful release: [${lastGood.tag}](https://github.com/${process.env.GITHUB_REPOSITORY}/releases/tag/${lastGood.tag}).` : 'No successful personal release yet.'}\n\n<!-- orca-personal-ledger\n${JSON.stringify(ledger)}\n-->`
api(path, { body })
writeFileSync(join(directory, 'status-ledger.json'), JSON.stringify(ledger, null, 2))
