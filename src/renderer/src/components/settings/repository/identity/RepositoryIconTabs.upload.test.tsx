// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { sanitizeRepoIcon, type RepoIcon } from '../../../../../../shared/repo-icon'
import { RepositoryIconTabs } from './RepositoryIconTabs'

vi.mock('../../../repo/repo-icon', () => ({ getRepoLucideIconOptions: () => [] }))

const source = 'data:image/svg+xml;base64,PHN2Zy8+'
const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const getContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
const githubIcon: RepoIcon = {
  type: 'image',
  source: 'github',
  src: 'https://github.com/example.png?size=64'
}

let dispose = () => {}
afterEach(() => {
  dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (getContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContext)
  }
})

async function renderPicker({
  width = 1024,
  height = 512,
  decode = vi.fn<() => Promise<void>>(async () => undefined),
  pick = vi.fn(async () => ({ dataUrl: source, fileName: 'logo.svg' }))
} = {}) {
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = width
      naturalHeight = height
      decode = decode
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
  Object.assign(window, { api: { shell: { pickRepoIconImage: pick } } })
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
        onUseGitHubAvatar={() => icons.push(githubIcon)}
      />
    )
  })
  const upload = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Upload')
  )
  const github = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Use GitHub Avatar')
  )
  if (!upload || !github) {
    throw new Error('Missing icon controls')
  }
  return { icons, upload, github, pick }
}

it('stores a decoded upload as PNG accepted by the existing project icon contract', async () => {
  const { icons, upload } = await renderPicker()
  await act(async () => {
    upload.click()
    await vi.waitFor(() => expect(icons).toHaveLength(1))
  })
  expect(icons[0]).toEqual({
    type: 'image',
    source: 'upload',
    label: 'logo.svg',
    src: 'data:image/png;base64,iVBORw0KGgo='
  })
  expect(sanitizeRepoIcon(icons[0])).toEqual(icons[0])
  expect(upload.disabled).toBe(false)
})

it('keeps the newest selection when an older conversion finishes last', async () => {
  let finish = () => {}
  const oldConversion = new Promise<void>((resolve) => {
    finish = resolve
  })
  const decode = vi
    .fn<() => Promise<void>>(async () => undefined)
    .mockImplementationOnce(() => oldConversion)
  const { icons, upload, github, pick } = await renderPicker({ decode })
  await act(async () => {
    upload.click()
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce())
  })
  expect(upload.disabled).toBe(true)
  await act(async () => {
    upload.click()
  })
  expect(pick).toHaveBeenCalledOnce()
  await act(async () => {
    github.click()
  })
  expect(icons).toEqual([githubIcon])
  expect(upload.disabled).toBe(false)
  pick.mockResolvedValueOnce({ dataUrl: source, fileName: 'newer.svg' })
  await act(async () => {
    upload.click()
    await vi.waitFor(() => expect(icons).toHaveLength(2))
  })
  await act(async () => {
    finish()
    await oldConversion
  })
  expect(icons).toHaveLength(2)
  expect(icons.at(-1)).toMatchObject({ source: 'upload', label: 'newer.svg' })
})

it('ignores a failed old upload after another icon is selected', async () => {
  let fail = (_reason: Error) => {}
  const oldConversion = new Promise<void>((_resolve, reject) => {
    fail = reject
  })
  const error = vi.spyOn(toast, 'error')
  const { icons, upload, github } = await renderPicker({
    decode: vi.fn(() => oldConversion)
  })
  await act(async () => {
    upload.click()
    await vi.waitFor(() => expect(upload.disabled).toBe(true))
  })
  await act(async () => {
    github.click()
  })
  await act(async () => {
    fail(new Error('old decode failed'))
  })
  expect(icons).toEqual([githubIcon])
  expect(error).not.toHaveBeenCalled()
})

it('shows delayed progress without allowing repeated uploads', async () => {
  vi.useFakeTimers()
  const pending = new Promise<void>(() => {})
  const { upload, pick } = await renderPicker({ decode: vi.fn(() => pending) })
  await act(async () => {
    upload.click()
  })
  expect(upload.disabled).toBe(true)
  expect(upload.getAttribute('aria-busy')).toBe('true')
  expect(upload.querySelector('.animate-spin')).toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
  expect(upload.querySelector('.animate-spin')).not.toBeNull()
  await act(async () => {
    upload.click()
  })
  expect(pick).toHaveBeenCalledOnce()
})

it('explains the advertised image limit without storing an oversized decode', async () => {
  const error = vi.spyOn(toast, 'error')
  const { icons, upload } = await renderPicker({ width: 6000, height: 6000 })
  expect(document.body.textContent).toContain('32 megapixels')
  await act(async () => {
    upload.click()
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
  })
  expect(icons).toEqual([])
  expect(error).toHaveBeenCalledWith('Image exceeds the 10MB or 32-megapixel limit.')
  expect(upload.disabled).toBe(false)
})
