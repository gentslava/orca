import { act } from '@testing-library/react'
import { Editor } from '@tiptap/react'
import { promptText } from './native-chat-prompt-document'
import { promptTextContent } from './native-chat-prompt-document-text'

export function promptEditor(element: HTMLElement): Editor {
  if (!('editor' in element) || !(element.editor instanceof Editor)) {
    throw new Error('The prompt element has no attached Tiptap editor')
  }
  return element.editor
}

export function promptValue(element: HTMLElement): string {
  return promptText(promptEditor(element).state.doc)
}

export function changePrompt(element: HTMLElement, value: string): void {
  act(() => {
    promptEditor(element).commands.setContent(promptTextContent(value))
  })
}
