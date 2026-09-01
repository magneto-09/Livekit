// Retries a fallible call once before giving up, so a single transient
// LLM/TTS failure doesn't have to fall all the way back to a scripted response.
export async function withRetry<T>(
  fn: () => PromiseLike<T>,
  label: string
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    console.error(`[Interview] ${label} failed, retrying once`, error)
    return await fn()
  }
}
