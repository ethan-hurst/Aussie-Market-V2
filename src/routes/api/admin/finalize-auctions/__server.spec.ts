import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST, GET } from './+server';
import { isAdmin } from '$lib/admin';

// Mock dependencies
vi.mock('$lib/admin');
vi.mock('$lib/supabase', () => ({
	supabase: {
		from: vi.fn(),
		rpc: vi.fn()
	}
}));
vi.mock('$lib/security', () => ({
	rateLimit: vi.fn(() => ({ allowed: true }))
}));
vi.mock('$lib/errors', () => ({
	mapApiErrorToMessage: vi.fn((error) => error.message || 'Unknown error')
}));
vi.mock('$lib/validation', () => ({
	validate: vi.fn((schema, data) => ({ ok: true, value: data })),
	z: {
		object: vi.fn(() => ({
			parse: vi.fn((data) => data),
			safeParse: vi.fn((data) => ({ success: true, data }))
		})),
		string: vi.fn(() => ({
			uuid: vi.fn(() => ({
				optional: vi.fn(() => ({}))
			})),
			min: vi.fn(() => ({
				max: vi.fn(() => ({}))
			}))
		})),
		boolean: vi.fn(() => ({
			optional: vi.fn(() => ({
				default: vi.fn(() => ({}))
			}))
		}))
	}
}));

describe('Admin Finalize Auctions API', () => {
	const mockRequest = (body: any) => ({
		json: vi.fn().mockResolvedValue(body)
	});

	const mockLocals = (user: any) => ({
		getSession: vi.fn().mockResolvedValue({
			data: { session: { user } }
		})
	});

	const mockUrl = (searchParams: Record<string, string>) => ({
		searchParams: {
			get: vi.fn((key: string) => searchParams[key] || null)
		}
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('POST /api/admin/finalize-auctions', () => {
		it('should require authentication', async () => {
			const request = mockRequest({});
			const locals = mockLocals(null);

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toBe('Unauthorized');
		});

		it('should require admin privileges', async () => {
			const request = mockRequest({ reason: 'Test reason' });
			const locals = mockLocals({ id: 'user-123', email: 'user@example.com' });

			vi.mocked(isAdmin).mockResolvedValue({
				allowed: false,
				reason: 'Admin privileges required'
			});

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toBe('Admin privileges required');
		});

		it('should finalize specific auction when admin', async () => {
			const request = mockRequest({
				auctionId: 'auction-123',
				reason: 'Test reason for manual finalization'
			});
			const locals = mockLocals({ id: 'admin-123', email: 'admin@example.com' });

			vi.mocked(isAdmin).mockResolvedValue({
				allowed: true,
				userProfile: { id: 'admin-123', email: 'admin@example.com', role: 'admin' }
			});

			// Mock Supabase responses
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.from).mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						single: vi.fn().mockResolvedValue({
							data: {
								id: 'auction-123',
								listing_id: 'listing-456',
								status: 'live',
								high_bid_id: 'bid-789',
								listings: {
									id: 'listing-456',
									title: 'Test Item',
									seller_id: 'seller-123',
									end_at: '2023-01-01T00:00:00Z'
								}
							},
							error: null
						})
					})
				})
			} as any);

			vi.mocked(supabase.rpc).mockResolvedValue({
				data: { success: true, order_created: true },
				error: null
			});

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.result.auctionId).toBe('auction-123');
		});

		it('should finalize all expired auctions when no auctionId provided', async () => {
			const request = mockRequest({
				reason: 'Test reason for bulk finalization'
			});
			const locals = mockLocals({ id: 'admin-123', email: 'admin@example.com' });

			vi.mocked(isAdmin).mockResolvedValue({
				allowed: true,
				userProfile: { id: 'admin-123', email: 'admin@example.com', role: 'admin' }
			});

			// Mock Supabase RPC call
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.rpc).mockResolvedValue({
				data: { success: true, auctions_processed: 3 },
				error: null
			});

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.result.processed).toBe(3);
		});

		it('should reject finalization of non-expired auction without force', async () => {
			const request = mockRequest({
				auctionId: 'auction-123',
				reason: 'Test reason'
			});
			const locals = mockLocals({ id: 'admin-123', email: 'admin@example.com' });

			vi.mocked(isAdmin).mockResolvedValue({
				allowed: true,
				userProfile: { id: 'admin-123', email: 'admin@example.com', role: 'admin' }
			});

			// Mock auction that hasn't expired yet
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.from).mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						single: vi.fn().mockResolvedValue({
							data: {
								id: 'auction-123',
								listing_id: 'listing-456',
								status: 'live',
								high_bid_id: 'bid-789',
								listings: {
									id: 'listing-456',
									title: 'Test Item',
									seller_id: 'seller-123',
									end_at: '2030-01-01T00:00:00Z' // Future date
								}
							},
							error: null
						})
					})
				})
			} as any);

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.result.success).toBe(false);
			expect(data.result.error).toContain('not expired yet');
		});
	});

	describe('GET /api/admin/finalize-auctions', () => {
		it('should require admin privileges for status check', async () => {
			const url = mockUrl({ action: 'status' });
			const locals = mockLocals({ id: 'user-123', email: 'user@example.com' });

			vi.mocked(isAdmin).mockResolvedValue({
				allowed: false,
				reason: 'Admin privileges required'
			});

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.error).toBe('Admin privileges required');
		});

		it('should return expired auctions status when admin', async () => {
			const url = mockUrl({ action: 'status' });
			const locals = mockLocals({ id: 'admin-123', email: 'admin@example.com' });

			vi.mocked(isAdmin).mockResolvedValue({
				allowed: true,
				userProfile: { id: 'admin-123', email: 'admin@example.com', role: 'admin' }
			});

			// Mock expired auctions
			const { supabase } = await import('$lib/supabase');
			vi.mocked(supabase.from).mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						lt: vi.fn().mockResolvedValue({
							data: [
								{
									id: 'auction-1',
									listing_id: 'listing-1',
									status: 'live',
									high_bid_id: 'bid-1',
									listings: {
										id: 'listing-1',
										title: 'Expired Item 1',
										seller_id: 'seller-1',
										end_at: '2023-01-01T00:00:00Z'
									}
								},
								{
									id: 'auction-2',
									listing_id: 'listing-2',
									status: 'live',
									high_bid_id: 'bid-2',
									listings: {
										id: 'listing-2',
										title: 'Expired Item 2',
										seller_id: 'seller-2',
										end_at: '2023-01-01T00:00:00Z'
									}
								}
							],
							error: null
						})
					})
				})
			} as any);

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.count).toBe(2);
			expect(data.expiredAuctions).toHaveLength(2);
		});
	});
});


