export function withGitHubReadRetry(read) {
  for (let attempt = 0; ; attempt++) {
    try {
      return read()
    } catch (error) {
      const transient =
        /\bEOF\b|ECONNRESET|ETIMEDOUT|HTTP 50[234]\b|SSL_ERROR_SYSCALL|Connection reset by peer|remote end hung up unexpectedly/i.test(
          String(error.stderr ?? '')
        )
      if (attempt >= 3 || !transient) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * 2 ** attempt)
    }
  }
}
