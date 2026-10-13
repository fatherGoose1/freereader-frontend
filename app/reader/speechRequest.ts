import type { TtsStatus } from "./tts";

const MAX_RETRIES = 6;
const MAX_RETRY_WAIT_MS = 60_000;

function waitForRetry(milliseconds: number, signal?: AbortSignal | null): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason ?? new DOMException("Speech was cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// A short capacity spike should not stop a long listening session. Retry only
// explicit retryable server responses, respect their delay, and keep retries
// bounded and cancellable. Authentication, quota, network, and generic 5xx errors
// are surfaced normally; the landing demo does not use this helper.
export async function requestSpeech(url: string, init: RequestInit, status?: TtsStatus): Promise<Response> {
  const started = performance.now();
  let waited = 0;
  for (let attempt = 0; ; attempt += 1) {
    init.signal?.throwIfAborted();
    const response = await fetch(url, init);
    const seconds = Number(response.headers.get("Retry-After"));
    const delay = seconds * 1000;
    if ((response.status !== 429 && response.status !== 503) || !Number.isFinite(seconds) || seconds <= 0
      || attempt >= MAX_RETRIES || waited + delay > MAX_RETRY_WAIT_MS
      || performance.now() - started + delay > MAX_RETRY_WAIT_MS) return response;
    await response.body?.cancel();
    status?.(`Speech is busy. Retrying in ${seconds} seconds`);
    await waitForRetry(delay, init.signal);
    waited += delay;
  }
}
