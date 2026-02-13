export interface RetryOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 250;

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRetryDelay(baseDelayMs: number, attempt: number): number {
  return baseDelayMs * 2 ** attempt;
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  options: RetryOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);

    try {
      const signal = init.signal
        ? AbortSignal.any([init.signal, timeoutController.signal])
        : timeoutController.signal;

      const response = await fetch(input, {
        ...init,
        signal,
      });

      clearTimeout(timeoutHandle);

      if (!shouldRetryStatus(response.status) || attempt === retries) {
        return response;
      }

      await sleep(buildRetryDelay(retryDelayMs, attempt));
    } catch (error) {
      clearTimeout(timeoutHandle);
      lastError = error;

      if (attempt === retries) {
        break;
      }

      await sleep(buildRetryDelay(retryDelayMs, attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("HTTP request failed after retries");
}

export async function fetchJsonWithRetry<T>(
  input: string | URL,
  init: RequestInit = {},
  options: RetryOptions = {}
): Promise<{ response: Response; data: T }> {
  const response = await fetchWithRetry(input, init, options);
  const data = (await response.json()) as T;
  return { response, data };
}
