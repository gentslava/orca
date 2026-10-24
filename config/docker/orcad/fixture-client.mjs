import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { parsePairingCode } from '../../../src/shared/pairing.ts'
import { pairedRuntimeConnectionFromOffer } from '../../../src/shared/paired-runtime-connection.ts'
import { RemoteRuntimeRequestConnection } from '../../../src/shared/remote-runtime/requests/remote-runtime-request-connection.ts'

async function main() {
  const [pairingFile, statusFile] = process.argv.slice(2)
  const offer = parsePairingCode((await readFile(pairingFile, 'utf8')).trim())
  assert.ok(offer, 'fixture pairing offer is invalid')
  const connection = new RemoteRuntimeRequestConnection(pairedRuntimeConnectionFromOffer(offer))
  try {
    const response = await connection.request('status.get', null, 10000)
    assert.equal(response.ok, true)
    assert.ok(response.result.runtimeId)
    assert.ok(response.result.pairedDeviceId)
    assert.ok(response.result.capabilities.includes('usage.history.v1'))
    if (process.argv.includes('--create')) {
      const enabled = await connection.request(
        'usage.setEnabled',
        { provider: 'codex', enabled: true },
        10000
      )
      assert.equal(enabled.ok, true, JSON.stringify(enabled))
      const refreshed = await connection.request(
        'usage.refresh',
        { provider: 'codex', force: true },
        30000
      )
      assert.equal(refreshed.ok, true, JSON.stringify(refreshed))
    }
    const usage = await connection.request(
      'usage.getSnapshot',
      { provider: 'codex', scope: 'all', range: 'all', limit: 10, includeHistory: true },
      10000
    )
    assert.equal(usage.ok, true, JSON.stringify(usage))
    const snapshot = usage.result
    assert.equal(snapshot.scanState.lastScanError, null)
    assert.ok(snapshot.scanState.lastScanCompletedAt)
    assert.equal(snapshot.summary.totalTokens, 1200)
    const row = snapshot.history.find((item) => item.sessionId === 'usage-fixture')
    assert.ok(row, 'fresh synthetic usage row was not scanned')
    assert.equal(row.day, '2026-10-24')
    assert.equal(row.newInputTokens, 100)
    assert.equal(row.cacheReadTokens, 900)
    assert.equal(row.outputTokens, 200)
    assert.equal(row.reasoningTokens, 150)
    assert.equal(row.totalTokens, 1200)
    assert.ok(row.apiEquivalentCostUsd > 0)
    const summary = {
      runtimeId: response.result.runtimeId,
      pairedDeviceId: response.result.pairedDeviceId,
      appVersion: response.result.appVersion,
      protocolVersion: response.result.protocolVersion,
      usage: {
        scanCompletedAt: snapshot.scanState.lastScanCompletedAt,
        totalTokens: snapshot.summary.totalTokens,
        row
      }
    }
    if (process.argv.includes('--create')) {
      await writeFile(statusFile, JSON.stringify(summary))
    } else {
      const previous = JSON.parse(await readFile(statusFile, 'utf8'))
      assert.equal(summary.pairedDeviceId, previous.pairedDeviceId)
    }
    console.log(JSON.stringify(summary))
  } finally {
    connection.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
