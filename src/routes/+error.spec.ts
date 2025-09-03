import { describe, it, expect, vi } from 'vitest';

// Mock modules used by hooks.server.ts so we can import handleError in tests
vi.mock('@supabase/ssr', () => ({ default: { createServerClient: vi.fn() } }));
vi.mock('$lib/startup', () => ({ initializeApplication: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://localhost', PUBLIC_SUPABASE_ANON_KEY: 'anon' }));
vi.mock('$app/environment', () => ({ dev: false }));

describe('Global error boundary', () => {
  it('handleError returns sanitized message in prod', async () => {
    const mod = await import('../hooks.server');
    const result = (mod as any).handleError({
      error: new Error('Sensitive details'),
      event: { url: new URL('http://localhost/foo'), request: { method: 'GET' } }
    });
    expect(result.message).toBeTypeOf('string');
    expect(result.message).toContain('Something went wrong');
  });
});


