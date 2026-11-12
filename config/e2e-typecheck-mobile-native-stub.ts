// E2E imports mobile readers, not a native app's global timer declarations.
export declare const Platform: { OS: 'ios' | 'android' | 'web' | 'windows' | 'macos' }
export declare const AppState: {
  currentState: string
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void }
}
export type TextInputSelectionChangeEvent = {
  nativeEvent: { selection: { start: number; end: number }; text?: string }
}
