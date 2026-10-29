import { expect, it } from 'vitest'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { wslMoveCutoverFixture } from '../__fixtures__/wsl-mover/wsl-move-cutover-fixture'
import { createUncToLinuxPathRewriter } from './wsl-move-path-rewriter'
import { wslMoveRewriteScope } from './wsl-move-rewrite-scope'
import { wslMovePersonalProjectOrderUpdate } from './wsl-move-personal-project-order'

it('copies moved local project preferences beside their old keys without changing other owners', () => {
  const host = toRuntimeExecutionHostId('wsl:Ubuntu')
  const key = (owner: string, project: string) => JSON.stringify([owner, owner, `repo:${project}`])
  const scope = wslMoveRewriteScope({
    cutover: wslMoveCutoverFixture(
      'move-1',
      'destination-committed',
      {},
      {
        repoIds: ['repo-a', 'existing'],
        folderWorkspaceIds: ['folder-1']
      }
    ),
    rewritePath: createUncToLinuxPathRewriter('Ubuntu'),
    destinationHostId: host,
    recordSeededHostWorkspaceIds: () => {}
  })
  const ui = {
    personalProjectOrder: {
      revision: 8,
      projects: {
        [key('local', 'repo-a')]: { pinned: true, openCount: 4, lastOpenedAt: 7 },
        [key('local', 'folder-1')]: { pinned: true },
        [key('local', 'unmoved')]: { openCount: 2 },
        [key('ssh:box', 'repo-a')]: { openCount: 3 },
        [key('local', 'existing')]: { openCount: 6 },
        [key(host, 'existing')]: { openCount: 10 },
        'github:owner/repo': { pinned: true },
        'invalid identity': { pinned: true }
      },
      settledOperations: ['writer:1']
    }
  }
  const updates = wslMovePersonalProjectOrderUpdate(ui, scope)
  expect(updates?.personalProjectOrder).toEqual({
    ...ui.personalProjectOrder,
    revision: 9,
    projects: {
      ...ui.personalProjectOrder.projects,
      [key(host, 'repo-a')]: ui.personalProjectOrder.projects[key('local', 'repo-a')],
      [key(host, 'folder-1')]: { pinned: true }
    }
  })
  expect(wslMovePersonalProjectOrderUpdate({ ...ui, ...updates }, scope)).toBeNull()
})
