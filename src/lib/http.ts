import { logger } from "./logger";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000; // 1 second

// Status codes worth retrying — the server (or network) is likely
// to recover. 429 = rate limited, 500 = internal server error, 502/503/504 = server-side hiccups.
const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUEST_TIMEOUT_MS = 8000; // give up waiting after 8 seconds

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}


export async function fetchWithRetry(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  let attempt = 0;

  while (true) {
    let response: Response;

    try {
      response = await fetchWithTimeout(url, init);
    } catch (networkError) {
      // fetch() itself threw — this means the network failed entirely
      // (DNS failure, connection refused, etc.), not that we got a bad response.
      // Treat this as transient too, since it's usually temporary.
      attempt++;
      if (attempt > MAX_RETRIES) {
        throw new Error(`Network error after ${MAX_RETRIES} retries: ${networkError}`);
      }
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      logger.warn("Network error, retrying", { url, attempt, delay_ms: delay });
      await sleep(delay);
      continue;
    }

    // Success — hand back the response, no retry needed
    if (response.ok) {
      return response;
    }

    // Permanent failure — retrying won't help, fail fast and loudly
    if (!TRANSIENT_STATUS_CODES.has(response.status)) {
      throw new Error(`Permanent error: ${response.status} ${response.statusText} for ${url}`);
    }

    // Transient failure — decide how long to wait, then retry
    attempt++;
    if (attempt > MAX_RETRIES) {
      throw new Error(`Gave up after ${MAX_RETRIES} retries: ${response.status} ${response.statusText}`);
    }

    // Prefer the server's own guidance if it gives one
    const retryAfterHeader = response.headers.get("retry-after");
    const delay = retryAfterHeader
      ? Number(retryAfterHeader) * 1000
      : BASE_DELAY_MS * 2 ** (attempt - 1); // exponential backoff: 1s, 2s, 4s, 8s, 16s

    logger.warn("Transient error, retrying", {
      url,
      status: response.status,
      attempt,
      delay_ms: delay,
    });

    await sleep(delay);
  }
}