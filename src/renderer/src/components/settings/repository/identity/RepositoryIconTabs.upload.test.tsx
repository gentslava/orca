// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { sanitizeRepoIcon, type RepoIcon } from '../../../../../../shared/repo-icon'
import { RepositoryIconTabs } from './RepositoryIconTabs'

vi.mock('../../../repo/repo-icon', () => ({ getRepoLucideIconOptions: () => [] }))

const source = 'data:image/svg+xml;base64,PHN2Zy8+'
const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const getContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')

let dispose = () => {}
afterEach(() => {
  dispose()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (getContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContext)
  }
})

it('stores a decoded upload as PNG accepted by the existing project icon contract', async () => {
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 1024
      naturalHeight = 512
      decode = async () => undefined
    }
  )
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:project-icon')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ drawImage: () => undefined })
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback
  ) {
    expect([this.width, this.height]).toEqual([128, 64])
    callback(new Blob([pngBytes], { type: 'image/png' }))
  })
  Object.assign(window, {
    api: {
      shell: {
        pickRepoIconImage: async () => ({ dataUrl: source, fileName: 'logo.svg' })
      }
    }
  })
  const icons: (RepoIcon | null)[] = []
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  dispose = () => {
    act(() => root.unmount())
    container.remove()
  }
  await act(async () => {
    root.render(
      <RepositoryIconTabs
        initialTab="avatar"
        selectedLucideName={null}
        selectedEmoji=""
        loadingGitHub={false}
        onSetIcon={(icon) => icons.push(icon)}
        onUseGitHubAvatar={() => undefined}
      />
    )
  })
  const upload = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Upload')
  )
  expect(upload).toBeDefined()
  await act(async () => {
    upload?.click()
    await vi.waitFor(() => expect(icons).toHaveLength(1))
  })
  expect(icons[0]).toEqual({
    type: 'image',
    source: 'upload',
    label: 'logo.svg',
    src: 'data:image/png;base64,iVBORw0KGgo='
  })
  expect(sanitizeRepoIcon(icons[0])).toEqual(icons[0])
})
