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
 * Enhanced CSRF protection middleware for state-changing API requests
 * 
 * SECURITY FEATURES:
 * - Validates Origin header matches site origin
 * - Requires Origin header for state-changing methods
 * - Validates Referer header as fallback
 * - Blocks requests from untrusted origins
 * - Comprehensive logging for security monitoring
 */
export interface CsrfValidationResult {
  valid: boolean;
  reason?: string;
  headers?: Record<string, string>;
}

/**
 * Comprehensive CSRF validation for API endpoints
 */
export function validateCsrfToken(event: { request: Request; url: URL }): CsrfValidationResult {
  const method = event.request.method.toUpperCase();
  const pathname = event.url.pathname;
  
  // Skip validation for safe methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { valid: true };
  }
  
  // Skip validation for non-API routes
  if (!pathname.startsWith('/api/')) {
    return { valid: true };
  }
  
  // Skip validation for webhook endpoints (have their own validation)
  if (pathname.includes('/webhooks/')) {
    return { valid: true };
  }
  
  // Allow tests to bypass (but log for security monitoring)
  const testUserId = event.request.headers.get('x-test-user-id');
  if (testUserId) {
    console.warn('[CSRF] Test bypass used:', { pathname, method, testUserId });
    return { valid: true };
  }
  
  const origin = event.request.headers.get('origin');
  const referer = event.request.headers.get('referer');
  const userAgent = event.request.headers.get('user-agent');
  const contentType = event.request.headers.get('content-type');
  
  // CSRF Protection: Origin header validation
  if (origin) {
    if (origin !== event.url.origin) {
      return {
        valid: false,
        reason: `Invalid origin: ${origin} (expected: ${event.url.origin})`,
        headers: { 'X-CSRF-Error': 'invalid-origin' }
      };
    }
  } else {
    // For state-changing requests, Origin is required
    // Referer can be used as fallback but is less reliable
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.origin !== event.url.origin) {
          return {
            valid: false,
            reason: `Invalid referer: ${referer} (expected origin: ${event.url.origin})`,
            headers: { 'X-CSRF-Error': 'invalid-referer' }
          };
        }
      } catch (error) {
        return {
          valid: false,
          reason: `Malformed referer header: ${referer}`,
          headers: { 'X-CSRF-Error': 'malformed-referer' }
        };
      }
    } else {
      // No Origin or Referer header - block the request
      return {
        valid: false,
        reason: 'Missing Origin and Referer headers for state-changing request',
        headers: { 'X-CSRF-Error': 'missing-headers' }
      };
    }
  }
  
  // Additional security checks
  
  // Check for suspicious user agents
  if (userAgent && isSuspiciousUserAgent(userAgent)) {
    console.warn('[CSRF] Suspicious user agent detected:', { pathname, userAgent, origin });
  }
  
  // Validate content type for POST/PUT requests with body
  if ((method === 'POST' || method === 'PUT') && contentType) {
    if (!isAllowedContentType(contentType)) {
      return {
        valid: false,
        reason: `Unsupported content type: ${contentType}`,
        headers: { 'X-CSRF-Error': 'invalid-content-type' }
      };
    }
  }
  
  return { valid: true };
}

/**
 * Legacy function for backwards compatibility
 */
export function isCsrfRequestValid(event: { request: Request; url: URL }): boolean {
  const result = validateCsrfToken(event);
  return result.valid;
}

/**
 * Check if User-Agent appears to be from an automated tool or bot
 */
function isSuspiciousUserAgent(userAgent: string): boolean {
  const suspiciousPatterns = [
    /curl\//i,
    /wget\//i,
    /python-requests\//i,
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i
  ];
  
  return suspiciousPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Validate content type is allowed for API requests
 */
function isAllowedContentType(contentType: string): boolean {
  const allowedTypes = [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain'
  ];
  
  return allowedTypes.some(type => contentType.toLowerCase().includes(type));
}


