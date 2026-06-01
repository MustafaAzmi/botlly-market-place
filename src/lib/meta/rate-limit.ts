// Lightweight in-process rate-limit protection for Meta Graph API calls.
//
// The Graph API enforces per-app/per-user rate limits. To stay well under them
// during batch syncs we (a) cap concurrency to one merchant at a time and
// (b) space out calls with a small delay. This is intentionally simple — a
// durable queue (e.g. a jobs table or external queue) is the next step at scale,
// and the sync job is written so it can be swapped in without touching callers.

const MIN_CALL_INTERVAL_MS = 250;
let lastCallAt = 0;

// Await a slot before making the next Graph API call.
export async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + MIN_CALL_INTERVAL_MS - now);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

// Run an async task and treat Graph API rate-limit errors (code 4 / 17 / 32 /
// 613) as a soft stop signal so the caller can back off instead of hammering.
export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(4|17|32|613)\b/.test(message) && /rate|limit|throttl/i.test(message);
}
