import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase and storage upload helpers
vi.mock('$lib/supabase', () => ({ supabase: {} }));
vi.mock('$lib/storage', () => ({
  STORAGE_BUCKETS: { ADDRESS_PROOFS: 'address-proofs' },
  validateFile: (f: File) => ({ valid: true }),
  validateProofFile: (f: File) => ({ valid: true }),
  uploadAddressProof: vi.fn().mockResolvedValue({ url: 'https://example.com/f', path: 'u1/poa_1.pdf', metadata: { size: 123, type: 'application/pdf', uploadedAt: new Date().toISOString() } })
}));

describe('POST /api/storage/upload (address_proof)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a proof-of-address file and returns success', async () => {
    const { POST } = await import('./+server');

    const file = new File([new Blob(['pdf'], { type: 'application/pdf' })], 'bill.pdf');
    const form = new FormData();
    form.append('file', file);
    form.append('type', 'address_proof');

    const locals = {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } })
    } as any;

    const res = await POST({ request: { formData: async () => form } as any, locals } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.path).toContain('u1/');
  });
});