import { describe, expect, it } from 'vitest'
import { MOBILE_RPC_METHOD_ROUTES } from './runtime-rpc-mobile-method-routing'

describe('mobile RPC method routing census', () => {
  it.each([
    'ui.setConversationPreference',
    'jira.status',
    'jira.listIssues',
    'jira.searchIssues',
    'jira.getIssue',
    'jira.issueComments'
  ])('keeps %s on the paired desktop that owns its preferences and Jira connection', (method) => {
    expect(MOBILE_RPC_METHOD_ROUTES.get(method)).toBe('paired-desktop')
  })

  it('routes no per-section collapse write while the sidebar-inputs switch is off', () => {
    expect(MOBILE_RPC_METHOD_ROUTES.has('ui.setCollapsed')).toBe(false)
  })

  it('sends a targeted status to the server, whose features a server workspace gates on', () => {
    expect(MOBILE_RPC_METHOD_ROUTES.get('status.get')).toBe('execution-host')
  })

  it('reads chat attachment bytes from the execution host that owns their store', () => {
    expect(MOBILE_RPC_METHOD_ROUTES.get('agentSessionAttachment.read')).toBe('execution-host')
  })
})
