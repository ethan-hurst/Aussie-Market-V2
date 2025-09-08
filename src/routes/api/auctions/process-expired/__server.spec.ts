import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST, GET } from './+server';

// Mock dependencies
vi.mock('$lib/supabase', () => ({
	supabase: {
		from: vi.fn(),
		rpc: vi.fn()
	}
}));

describe('Process Expired Auctions API', () => {
	const mockLocals = (user: any) => ({
		getSession: vi.fn().mockResolvedValue({
			data: { session: user ? { user } : null }
		})
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('POST /api/auctions/process-expired', () => {
		it('should process expired auctions successfully', async () => {
			const request = {};
			const locals = mockLocals({ id: 'user-123' });

			// Mock successful RPC call
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.rpc).mockResolvedValue({
				data: { success: true, auctions_processed: 2 },
				error: null
			});

			// Mock metrics insert
			vi.mocked(supabase.from).mockReturnValue({
				insert: vi.fn().mockResolvedValue({ error: null })
			} as any);

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.result.auctions_processed).toBe(2);
			expect(supabase.rpc).toHaveBeenCalledWith('end_expired_auctions');
		});

		it('should handle RPC error', async () => {
			const request = {};
			const locals = mockLocals({ id: 'user-123' });

			// Mock RPC error
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.rpc).mockResolvedValue({
				data: null,
				error: { message: 'Database error' }
			});

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('Failed to process expired auctions');
			expect(data.details).toBe('Database error');
		});
	});

	describe('GET /api/auctions/process-expired', () => {
		it('should return correct count of expired auctions using proper join', async () => {
			// Mock count query with proper join and metrics query
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.from)
				.mockReturnValueOnce({
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							lt: vi.fn().mockResolvedValue({
								count: 3,
								error: null
							})
						})
					})
				} as any)
				.mockReturnValueOnce({
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							order: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue({
									data: [],
									error: null
								})
							})
						})
					})
				} as any);

			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.expired_auctions_pending).toBe(3);
			
			// Verify correct query structure: join with listings and filter on end_at
			const fromCall = vi.mocked(supabase.from);
			expect(fromCall).toHaveBeenCalledWith('auctions');
			
			const selectCall = fromCall.mock.results[0].value.select;
			expect(selectCall).toHaveBeenCalledWith('id, listings!inner(end_at)', { count: 'exact', head: true });
			
			const eqCall = selectCall.mock.results[0].value.eq;
			expect(eqCall).toHaveBeenCalledWith('status', 'live');
			
			const ltCall = eqCall.mock.results[0].value.lt;
			expect(ltCall).toHaveBeenCalledWith('listings.end_at', expect.any(String));
		});

		it('should handle query error', async () => {
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.from).mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						lt: vi.fn().mockResolvedValue({
							count: null,
							error: { message: 'Query failed' }
						})
					})
				})
			} as any);

			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(500);
			expect(data.error).toBe('Failed to get auction status');
		});

		it('should return zero when no expired auctions', async () => {
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.from)
				.mockReturnValueOnce({
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							lt: vi.fn().mockResolvedValue({
								count: 0,
								error: null
							})
						})
					})
				} as any)
				.mockReturnValueOnce({
					select: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							order: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue({
									data: [],
									error: null
								})
							})
						})
					})
				} as any);

			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.expired_auctions_pending).toBe(0);
		});
	});

	it('should verify query uses correct status and field names', async () => {
		// This test specifically verifies the fix for status='active' -> 'live'
		// and end_at field location in listings table
		const { supabase } = await import('$lib/supabase');
		vi.mocked(supabase.from)
			.mockReturnValueOnce({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						lt: vi.fn().mockResolvedValue({
							count: 1,
							error: null
						})
					})
				})
			} as any)
			.mockReturnValueOnce({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						order: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue({
								data: [],
								error: null
							})
						})
					})
				})
			} as any);

		await GET();

		// Verify the query structure matches our fixes:
		// 1. Uses 'live' status (not 'active')
		// 2. Joins with listings table to access end_at
		// 3. Filters on listings.end_at (not auctions.end_at)
		const fromCall = vi.mocked(supabase.from);
		const selectArgs = fromCall.mock.results[0].value.select.mock.calls[0];
		const eqArgs = fromCall.mock.results[0].value.select.mock.results[0].value.eq.mock.calls[0];
		const ltArgs = fromCall.mock.results[0].value.select.mock.results[0].value.eq.mock.results[0].value.lt.mock.calls[0];

		expect(selectArgs[0]).toContain('listings!inner(end_at)');
		expect(eqArgs[1]).toBe('live'); // Not 'active'
		expect(ltArgs[0]).toBe('listings.end_at'); // Not 'end_at' or 'auctions.end_at'
	});
});