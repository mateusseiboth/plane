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

// Prune stale buckets every 5 minutes to avoid memory leaks
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [k, b] of buckets) {
    if (b.lastRefill < cutoff) buckets.delete(k);
  }
}, 5 * 60_000);
