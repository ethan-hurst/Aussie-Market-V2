import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeFetch } from './http';

describe('safeFetch', () => {
  const originalFetch = globalThis.fetch as any;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns Response when ok', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ok', { status: 200 }));
    const res = await safeFetch('http://example.com');
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe('ok');
  });

  it('throws mapped error when response not ok with JSON error payload', async () => {
    const payload = { error: 'permission denied for table bids' };
    const resp = new Response(JSON.stringify(payload), { status: 403, headers: { 'Content-Type': 'application/json' } });
    globalThis.fetch = vi.fn(async () => resp);
    await expect(safeFetch('http://example.com')).rejects.toThrow('You are not allowed to perform this action.');
  });

  it('throws mapped error when fetch rejects (network error)', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network failed'); });
    await expect(safeFetch('http://example.com')).rejects.toThrow(/Network error/i);
  });
});


