// Simple in-memory rate limiter and CSRF helpers

type RateWindow = {
  resetAt: number;
  count: number;
};

const rateBuckets = new Map<string, RateWindow>();

/**
 * Enforce a token-bucket style limit.
 * Key should identify user/action context, e.g. `bids:u123`.
 * Returns { allowed: boolean, retryAfterMs?: number }
 */
export function rateLimit(key: string, limit: number, windowMs: number): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    // Reset bucket
    rateBuckets.set(key, { resetAt: now + windowMs, count: 1 });
    return { allowed: true };
  }

  if (bucket.count < limit) {
    bucket.count += 1;
    return { allowed: true };
  }

  return { allowed: false, retryAfterMs: bucket.resetAt - now };
}

/**
 * Basic CSRF protection: for state-changing methods on /api routes,
 * if Origin header is present it must match event.url.origin.
 * Skips checks for test traffic (x-test-user-id).
 */
export function isCsrfRequestValid(event: { request: Request; url: URL }): boolean {
  const method = event.request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (!event.url.pathname.startsWith('/api/')) return true;

  // Allow tests to bypass
  if (event.request.headers.get('x-test-user-id')) return true;

  const origin = event.request.headers.get('origin');
  if (!origin) return true; // Most browsers set Origin on cross-site; allow if absent
  return origin === event.url.origin;
}


