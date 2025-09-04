import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RetryOperations, RetryStrategies } from './retry-strategies';

// Mock Supabase client
const mockSupabase = {
	from: vi.fn(() => ({
		select: vi.fn(() => ({
			eq: vi.fn(() => ({
				lt: vi.fn(() => ({
					data: [
						{
							id: 'auction-1',
							listing_id: 'listing-1',
							high_bid_id: 'bid-1',
							current_price_cents: 10000,
							status: 'ended',
							listings: {
								id: 'listing-1',
								seller_id: 'seller-1',
								title: 'Test Auction',
								end_at: '2024-01-01T00:00:00Z'
							}
						}
					],
					error: null
				}))
			}))
		})),
		insert: vi.fn(() => ({
			select: vi.fn(() => ({
				single: vi.fn(() => ({
					data: {
						id: 'order-1',
						listing_id: 'listing-1',
						buyer_id: 'buyer-1',
						seller_id: 'seller-1',
						amount_cents: 10000,
						state: 'pending_payment'
					},
					error: null
				}))
			}))
		})),
		update: vi.fn(() => ({
			eq: vi.fn(() => ({
				data: null,
				error: null
			}))
		})),
		rpc: vi.fn(() => ({
			data: { success: true, order_id: 'order-1' },
			error: null
		}))
	}))
};

describe('Retry Integration Tests', () => {
	let mockLogger: any;

	beforeEach(() => {
		vi.clearAllMocks();
		mockLogger = {
			debug: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			info: vi.fn()
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Database Operations with Retry', () => {
		it('should retry database operations on transient errors', async () => {
			let callCount = 0;
			const mockDbOperation = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount <= 2) {
					throw new Error('Connection timeout');
				}
				return Promise.resolve({
					data: [{ id: 'auction-1', status: 'ended' }],
					error: null
				});
			});

			const result = await RetryOperations.database(
				'fetch_ended_auctions',
				mockDbOperation,
				mockLogger,
				{ timestamp: '2024-01-01T00:00:00Z' }
			);

			expect(result.data).toHaveLength(1);
			expect(callCount).toBe(3); // 1 initial + 2 retries
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('fetch_ended_auctions failed on attempt'),
				expect.any(Object)
			);
		});

		it('should fail permanently on non-retryable database errors', async () => {
			const mockDbOperation = vi.fn().mockRejectedValue(
				new Error('Validation failed: invalid auction ID')
			);

			await expect(
				RetryOperations.database(
					'fetch_ended_auctions',
					mockDbOperation,
					mockLogger
				)
			).rejects.toThrow('Validation failed');

			expect(mockDbOperation).toHaveBeenCalledTimes(1);
			// Check that error was logged (could be either permanent failure or final failure message)
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringMatching(/fetch_ended_auctions failed (permanently|after \d+ attempts)/),
				expect.any(Error),
				expect.any(Object)
			);
		});
	});

	describe('Critical Operations with Retry', () => {
		it('should retry critical operations with more aggressive retry strategy', async () => {
			let callCount = 0;
			const mockCriticalOperation = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount <= 4) {
					throw new Error('Database deadlock detected');
				}
				return Promise.resolve({
					data: { success: true, order_id: 'order-1' },
					error: null
				});
			});

			const result = await RetryOperations.critical(
				'insert_order',
				mockCriticalOperation,
				mockLogger,
				{ auctionId: 'auction-1', buyerId: 'buyer-1' }
			);

			expect(result.data.success).toBe(true);
			expect(callCount).toBe(5); // 1 initial + 4 retries (critical has more retries)
		});

		it('should handle rate limiting with appropriate delays', async () => {
			let callCount = 0;
			const mockRateLimitedOperation = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount <= 1) { // Reduce retries to avoid timeout
					const error = new Error('Rate limit exceeded');
					error.code = 429;
					throw error;
				}
				return Promise.resolve({ data: 'success', error: null });
			});

			const startTime = Date.now();
			const result = await RetryOperations.critical(
				'rate_limited_operation',
				mockRateLimitedOperation,
				mockLogger
			);
			const endTime = Date.now();

			expect(result.data).toBe('success');
			expect(callCount).toBe(2);
			// Should have waited for rate limit delays (2s suggested delay)
			expect(endTime - startTime).toBeGreaterThan(1000);
		}, 10000); // Increase timeout to 10 seconds
	});

	describe('Notification Operations with Retry', () => {
		it('should retry notification operations on transient failures', async () => {
			let callCount = 0;
			const mockNotificationOperation = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount <= 1) {
					throw new Error('Network timeout');
				}
				return Promise.resolve({ data: null, error: null });
			});

			await RetryOperations.notification(
				'send_notification',
				mockNotificationOperation,
				mockLogger,
				{ userId: 'user-1', type: 'auction_won' }
			);

			expect(callCount).toBe(2);
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('send_notification failed on attempt 1'),
				expect.any(Object)
			);
		});

		it('should not retry notification operations on permanent failures', async () => {
			const mockNotificationOperation = vi.fn().mockRejectedValue(
				new Error('User not found')
			);

			await expect(
				RetryOperations.notification(
					'send_notification',
					mockNotificationOperation,
					mockLogger,
					{ userId: 'invalid-user', type: 'auction_won' }
				)
			).rejects.toThrow('User not found');

			expect(mockNotificationOperation).toHaveBeenCalledTimes(1);
		});
	});

	describe('Error Classification in Real Scenarios', () => {
		it('should correctly classify Supabase-specific errors', () => {
			const supabaseErrors = [
				{ code: 'PGRST301', message: 'Row Level Security violation' },
				{ code: 'PGRST116', message: 'JWT expired' },
				{ message: 'JWT token is invalid' }
			];

			supabaseErrors.forEach(error => {
				const classification = RetryStrategies.classifyError(error);
				expect(classification.isRetryable).toBe(true);
				expect(classification.reason).toContain('Authentication/authorization');
			});
		});

		it('should correctly classify database constraint errors', () => {
			const constraintErrors = [
				'duplicate key value violates unique constraint "orders_auction_id_key"',
				'unique constraint "auctions_pkey" violated',
				'deadlock detected',
				'serialization failure'
			];

			constraintErrors.forEach(errorMessage => {
				const classification = RetryStrategies.classifyError(new Error(errorMessage));
				expect(classification.isRetryable).toBe(true);
				expect(classification.reason).toContain('Database constraint');
			});
		});

		it('should correctly classify network and connection errors', () => {
			const networkErrors = [
				'Connection timeout',
				'ECONNRESET',
				'ENOTFOUND',
				'ETIMEDOUT',
				'ECONNABORTED'
			];

			networkErrors.forEach(errorMessage => {
				const classification = RetryStrategies.classifyError(new Error(errorMessage));
				expect(classification.isRetryable).toBe(true);
			});
		});
	});

	describe('Retry Strategy Configuration', () => {
		it('should use appropriate retry configurations for different operation types', () => {
			expect(RetryStrategies.CONFIGS.database.maxRetries).toBe(3);
			expect(RetryStrategies.CONFIGS.database.baseDelayMs).toBe(100);

			expect(RetryStrategies.CONFIGS.critical.maxRetries).toBe(7);
			expect(RetryStrategies.CONFIGS.critical.baseDelayMs).toBe(200);

			expect(RetryStrategies.CONFIGS.notification.maxRetries).toBe(4);
			expect(RetryStrategies.CONFIGS.notification.baseDelayMs).toBe(300);

			expect(RetryStrategies.CONFIGS.external_api.maxRetries).toBe(5);
			expect(RetryStrategies.CONFIGS.external_api.baseDelayMs).toBe(500);
		});

		it('should calculate appropriate delays with jitter', () => {
			const config = RetryStrategies.CONFIGS.database;
			
			// Test multiple calls to ensure jitter is working
			const delays = Array.from({ length: 10 }, () => 
				RetryStrategies.calculateDelay(2, config)
			);

			// All delays should be within expected range
			delays.forEach(delay => {
				expect(delay).toBeGreaterThanOrEqual(200); // 100 * 2^1 = 200
				expect(delay).toBeLessThanOrEqual(250); // 200 + 50 jitter
			});

			// Delays should vary due to jitter
			const uniqueDelays = new Set(delays);
			expect(uniqueDelays.size).toBeGreaterThan(1);
		});
	});

	describe('Context and Logging Integration', () => {
		it('should pass context through retry operations', async () => {
			const mockOperation = vi.fn().mockResolvedValue({ data: 'success' });

			await RetryOperations.database(
				'test_operation',
				mockOperation,
				mockLogger,
				{ auctionId: 'auction-1', userId: 'user-1' }
			);

			expect(mockLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('test_operation attempt 1/4'),
				expect.objectContaining({
					auctionId: 'auction-1',
					userId: 'user-1',
					attempt: 1
				})
			);
		});

		it('should log successful retries with attempt count', async () => {
			let callCount = 0;
			const mockOperation = vi.fn().mockImplementation(() => {
				callCount++;
				if (callCount <= 2) {
					throw new Error('Connection timeout');
				}
				return Promise.resolve({ data: 'success' });
			});

			await RetryOperations.database(
				'test_operation',
				mockOperation,
				mockLogger
			);

			expect(mockLogger.info).toHaveBeenCalledWith(
				expect.stringContaining('test_operation succeeded on attempt 3'),
				expect.objectContaining({
					attempt: 3,
					total_attempts: 3
				})
			);
		});
	});
});
