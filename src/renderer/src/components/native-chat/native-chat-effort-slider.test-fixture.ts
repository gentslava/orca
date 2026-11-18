import { fireEvent, screen } from '@testing-library/react'

export const effortSlider = (): HTMLElement => screen.getByRole('slider', { name: 'Effort' })
export const effortLabel = (): string | undefined =>
  effortSlider().getAttribute('aria-valuetext')?.split(' · ')[0]

export function chooseEffort(label: string): void {
  let key = 'Home'
  fireEvent.keyDown(effortSlider(), { key })
  const maximum = Number(effortSlider().getAttribute('aria-valuemax'))
  for (let step = 0; step <= maximum; step++) {
    if (effortLabel() === label) {
      fireEvent.keyDown(effortSlider(), { key: 'Enter' })
      return
    }
    key = 'ArrowRight'
    fireEvent.keyDown(effortSlider(), { key })
  }
  throw new Error(`Effort slider does not offer ${label}`)
}
