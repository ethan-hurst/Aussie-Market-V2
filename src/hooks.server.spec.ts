import { describe, it, expect, vi } from 'vitest';

async function importHandleErrorWithDev(devFlag: boolean) {
  vi.resetModules();
  vi.doMock('@supabase/ssr', () => ({
    default: { createServerClient: vi.fn(() => ({})) }
  }), { virtual: true });
  vi.doMock('$env/static/public', () => ({
    PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    PUBLIC_SUPABASE_ANON_KEY: 'eyJmocked'
  }), { virtual: true });
  vi.doMock('$lib/startup', () => ({
    initializeApplication: vi.fn(async () => {})
  }), { virtual: true });
  vi.doMock('$app/environment', () => ({ dev: devFlag }), { virtual: true });
  const mod = await import('./hooks.server');
  return mod.handleError as (args: { error: unknown; event: any }) => { message: string };
}

describe('handleError', () => {
  it('returns original error message in development', async () => {
    const handleError = await importHandleErrorWithDev(true);
    const result = handleError({
      error: new Error('boom'),
      event: {
        url: new URL('https://example.com/dev'),
        request: new Request('https://example.com/dev', { method: 'GET' })
      }
    });
    expect(result.message).toBe('boom');
  });

  it('returns sanitized message with correlation id in production', async () => {
    const handleError = await importHandleErrorWithDev(false);
    const result = handleError({
      error: new Error('sensitive details'),
      event: {
        url: new URL('https://example.com/prod'),
        request: new Request('https://example.com/prod', { method: 'POST' })
      }
    });
    expect(result.message).toMatch(/Something went wrong \(ref: [^)]+\)/);
  });
});


