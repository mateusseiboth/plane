interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Token-bucket rate limiter keyed by an arbitrary key (e.g. userId or IP).
 * Returns true if the request is allowed, false if rate-limited.
 */
export function checkRateLimit(
  key: string,
  maxRequests = 5,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: maxRequests - 1, lastRefill: now };
    buckets.set(key, bucket);
    return true;
  }

  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor((elapsed / windowMs) * maxRequests);
  if (refill > 0) {
    bucket.tokens = Math.min(maxRequests, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

const PRUNE_AFTER_MS = 5 * 60_000;

/**
 * Descarta buckets parados há mais de `maxIdleMs`, evitando vazamento de memória
 * quando o limitador é chaveado por IP. Exportada (em vez de embutida no
 * setInterval) para ser exercitável sem esperar o timer.
 */
export function pruneStaleBuckets(maxIdleMs = PRUNE_AFTER_MS): number {
  const cutoff = Date.now() - maxIdleMs;
  let removed = 0;
  for (const [k, b] of buckets) {
    if (b.lastRefill < cutoff) {
      buckets.delete(k);
      removed++;
    }
  }
  return removed;
}

// `unref` para o timer não segurar o processo (relevante em scripts e testes).
const pruneTimer = setInterval(pruneStaleBuckets, PRUNE_AFTER_MS);
(pruneTimer as unknown as {unref?: () => void}).unref?.();
