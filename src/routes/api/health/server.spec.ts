import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/startup', () => ({
  validateStartup: vi.fn(async () => ({
    success: true,
    errors: [],
    warnings: [],
    services: { supabase: true, stripe: true }
  }))
}));

describe('GET /api/health', () => {
  it('returns 200 with ok=true when startup validation succeeds', async () => {
    const { GET } = await import('./+server');
    const res = await GET({} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 503 with ok=false when startup validation fails', async () => {
    const startup = await import('$lib/startup');
    (startup as any).validateStartup.mockResolvedValueOnce({
      success: false,
      errors: ['missing env'],
      warnings: [],
      services: { supabase: false, stripe: true }
    });
    const { GET } = await import('./+server');
    const res = await GET({} as any);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toContain('missing env');
  });
});