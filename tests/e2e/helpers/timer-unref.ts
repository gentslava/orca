export function unrefTimer(timer: NodeJS.Timeout | number): void {
  if (typeof timer !== 'number') {
    timer.unref()
  }
}
