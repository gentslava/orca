import { createPortal } from 'react-dom'
import { useLayoutEffect, useRef, useState } from 'react'

export function NativeChatPickerListbox({
  id,
  children
}: {
  id: string
  children: React.ReactNode
}): React.JSX.Element {
  const marker = useRef<HTMLSpanElement>(null)
  const [bounds, setBounds] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    const anchor = marker.current?.parentElement
    if (!anchor) {
      return
    }
    const measure = (): void => {
      const next = anchor.getBoundingClientRect()
      setBounds((current) =>
        current?.left === next.left && current.width === next.width && current.top === next.top
          ? current
          : next
      )
    }
    const ancestors: HTMLElement[] = []
    for (let parent: HTMLElement | null = anchor; parent; parent = parent.parentElement) {
      ancestors.push(parent)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(anchor)
    ancestors.forEach((parent) => parent.addEventListener('scroll', measure))
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      ancestors.forEach((parent) => parent.removeEventListener('scroll', measure))
      window.removeEventListener('resize', measure)
    }
  }, [])
  return (
    <>
      <span ref={marker} />
      {bounds &&
        createPortal(
          <div
            id={id}
            role="listbox"
            style={{
              position: 'fixed',
              left: bounds.left,
              width: bounds.width,
              bottom: window.innerHeight - bounds.top + 4
            }}
            className="scrollbar-sleek z-50 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-floating"
          >
            {children}
          </div>,
          marker.current?.closest('.native-chat-appearance') ?? document.body
        )}
    </>
  )
}
