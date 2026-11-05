import type React from 'react'
import { vi } from 'vitest'
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) => {
    if (!values) {
      return fallback
    }
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
      fallback
    )
  }
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

// Keep mocked rows mounted for assertions.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="picker-root" data-open={open ? 'true' : 'false'}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <div data-disabled={disabled || undefined}>{children}</div>
  ),
  PopoverContent: ({
    children,
    side,
    align,
    collisionPadding
  }: {
    children: React.ReactNode
    side?: string
    align?: string
    collisionPadding?: number
  }) => (
    <div
      data-testid="picker-content"
      data-side={side}
      data-align={align}
      data-collision-padding={collisionPadding}
    >
      {children}
    </div>
  )
}))
