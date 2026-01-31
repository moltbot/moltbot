export async function fetchWithRetry(
  input: RequestInfo,
  init?: RequestInit,
  attempts = 3,
  initialDelayMs = 300,
): Promise<Response> {
  let lastError: unknown;
  let delay = initialDelayMs;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(input, init);
      return res;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }
  throw lastError;
}
