import { expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Row } from '../../../../../../shared/sidebar-list/row-types'
import {
  getSidebarOrderedRepoHeaderRowsByBucket,
  getSidebarOrderedRepoHeaderIdsByBucket
} from './project-header-drop'

it('keeps pinned and unpinned project drag targets in separate fixed tiers', () => {
  const a: Repo = { id: 'a', path: '/a', displayName: 'a', badgeColor: '', addedAt: 0 }
  const b: Repo = { ...a, id: 'b', path: '/b' }
  const headers: Row[] = [
    {
      type: 'header',
      key: 'a',
      label: 'a',
      count: 0,
      icon: { kind: 'project' },
      repo: a,
      projectPinned: true
    },
    {
      type: 'header',
      key: 'b',
      label: 'b',
      count: 0,
      icon: { kind: 'project' },
      repo: b,
      projectPinned: false
    }
  ]
  const buckets = getSidebarOrderedRepoHeaderIdsByBucket(headers)
  expect([...buckets.values()]).toEqual([['a'], ['b']])
})

it('resolves rendered same-id headers by their own membership and pin tier', () => {
  const repo: Repo = { id: 'same', path: '/same', displayName: 'Same', badgeColor: '', addedAt: 0 }
  const rows: Row[] = [
    {
      type: 'header',
      key: 'local',
      count: 0,
      icon: { kind: 'project' },
      repo: { ...repo, executionHostId: 'local' },
      projectPinned: true
    },
    {
      type: 'header',
      key: 'remote',
      count: 0,
      icon: { kind: 'project' },
      repo: { ...repo, executionHostId: 'runtime:remote' },
      projectPinned: false
    },
    {
      type: 'header',
      key: 'other-group',
      count: 0,
      icon: { kind: 'project' },
      repo: { ...repo, projectGroupId: 'other' }
    }
  ]
  const buckets = getSidebarOrderedRepoHeaderIdsByBucket(rows)
  expect(
    [...getSidebarOrderedRepoHeaderRowsByBucket(rows)].map(([bucket, headers]) => [
      bucket,
      headers.map((row) => row.key)
    ])
  ).toEqual([
    [JSON.stringify(['ungrouped', true]), ['local']],
    [JSON.stringify(['ungrouped', false]), ['remote']],
    ['group:other', ['other-group']]
  ])
  expect([...buckets.values()]).toEqual([['same'], ['same'], ['same']])
})
