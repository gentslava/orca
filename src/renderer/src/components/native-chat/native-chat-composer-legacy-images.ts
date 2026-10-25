import type { JSONContent } from '@tiptap/react'
import { splitImageReferences } from '../../../../shared/native-chat-image-reference'
import { IMAGE_REFERENCE_NODE } from './native-chat-prompt-document-text'

function textWithoutImageTokens(text: string): string {
  let afterImage = false
  return splitImageReferences(text)
    .map((part) => {
      if (typeof part !== 'string') {
        afterImage = true
        return ''
      }
      const kept = afterImage && part.startsWith(' ') ? part.slice(1) : part
      afterImage = false
      return kept
    })
    .join('')
}

function cleanDocument(node: JSONContent): { node: JSONContent; text: string; changed: boolean } {
  if (!node.content) {
    return {
      node,
      text: node.type === 'hardBreak' ? '\n' : (node.text ?? String(node.attrs?.token ?? '')),
      changed: false
    }
  }
  let afterImage = false
  let changed = false
  const content: JSONContent[] = []
  const text: string[] = []
  for (const child of node.content) {
    if (child.type === IMAGE_REFERENCE_NODE) {
      afterImage = true
      changed = true
      continue
    }
    const kept =
      afterImage && child.type === 'text' && child.text?.startsWith(' ')
        ? { ...child, text: child.text.slice(1) }
        : child
    afterImage = false
    if (kept.type === 'text' && kept.text === '') {
      continue
    }
    const clean = cleanDocument(kept)
    content.push(clean.node)
    text.push(clean.text)
    changed ||= clean.changed
  }
  return {
    node: changed ? { ...node, content } : node,
    text: text.join(node.type === 'doc' ? '\n' : ''),
    changed
  }
}

/** Old automatic image nodes leave the editor; image paths and ownership stay in the tray. */
export function nativeChatDraftWithoutLegacyImages(
  text: string,
  document?: JSONContent
): { text: string; document?: JSONContent } {
  if (document) {
    const clean = cleanDocument(document)
    return clean.changed ? { text: clean.text, document: clean.node } : { text, document }
  }
  const clean = textWithoutImageTokens(text)
  return { text: clean !== text && clean.trim() === '' ? '' : clean }
}
