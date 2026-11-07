import { fireEvent, screen } from '@testing-library/react'

export const effortSlider = (): HTMLElement => screen.getByRole('slider', { name: 'Effort' })
export const effortLabel = (): string | undefined =>
  effortSlider().getAttribute('aria-valuetext')?.split(' · ')[0]

export function chooseEffort(label: string): void {
  fireEvent.keyDown(effortSlider(), { key: 'Home' })
  const maximum = Number(effortSlider().getAttribute('aria-valuemax'))
  for (let step = 0; step <= maximum; step++) {
    if (effortLabel() === label) {
      return
    }
    fireEvent.keyDown(effortSlider(), { key: 'ArrowRight' })
  }
  throw new Error(`Effort slider does not offer ${label}`)
}
