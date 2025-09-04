import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger, measureTime } from '../supabase/functions/_shared/logger';
import { Metrics, MetricsCollector } from '../supabase/functions/_shared/metrics';

// Mock console methods
const mockConsole = {
	log: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn()
};

// Mock Supabase
vi.mock('$lib/supabase', () => ({
	supabase: {
		from: vi.fn(() => ({
			insert: vi.fn(() => ({
				select: vi.fn(() => Promise.resolve({ data: [], error: null }))
			}))
		}))
	}
}));

describe('Structured Logging System', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Mock console methods
		vi.spyOn(console, 'log').mockImplementation(mockConsole.log);
		vi.spyOn(console, 'warn').mockImplementation(mockConsole.warn);
		vi.spyOn(console, 'error').mockImplementation(mockConsole.error);
		vi.spyOn(console, 'debug').mockImplementation(mockConsole.debug);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('StructuredLogger', () => {
		it('should create structured log entries', () => {
			const logger = createLogger('test_function', { userId: 'user-123' });

			logger.info('Test message', { additional: 'data' });

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"level":"info"')
			);
			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"message":"Test message"')
			);
			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"functionName":"test_function"')
			);
			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"userId":"user-123"')
			);
		});

		it('should include error details in error logs', () => {
			const logger = createLogger('test_function');
			const error = new Error('Test error');

			logger.error('Operation failed', error);

			expect(mockConsole.error).toHaveBeenCalledWith(
				expect.stringContaining('"level":"error"')
			);
			expect(mockConsole.error).toHaveBeenCalledWith(
				expect.stringContaining('"error":{"name":"Error","message":"Test error"')
			);
		});

		it('should create child loggers with additional context', () => {
			const parentLogger = createLogger('parent_function', { requestId: 'req-123' });
			const childLogger = parentLogger.child({ auctionId: 'auction-456' });

			childLogger.info('Child message');

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"requestId":"req-123"')
			);
			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"auctionId":"auction-456"')
			);
		});

		it('should log performance metrics', () => {
			const logger = createLogger('test_function');

			logger.performance('database_query', 150, { table: 'users' });

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"operation":"database_query"')
			);
			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"duration_ms":150')
			);
		});

		it('should log counter metrics', () => {
			const logger = createLogger('test_function');

			logger.counter('auctions_processed', 5, { status: 'success' });

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"type":"metric"')
			);
			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"metric_name":"auctions_processed"')
			);
			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"value":5')
			);
		});
	});

	describe('measureTime utility', () => {
		it('should measure and log execution time', async () => {
			const logger = createLogger('test_function');
			const mockFn = vi.fn().mockResolvedValue('result');

			const result = await measureTime(logger, 'test_operation', mockFn);

			expect(result).toBe('result');
			expect(mockFn).toHaveBeenCalled();
			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"operation":"test_operation"')
			);
		});

		it('should log errors and re-throw them', async () => {
			const logger = createLogger('test_function');
			const error = new Error('Test error');
			const mockFn = vi.fn().mockRejectedValue(error);

			await expect(measureTime(logger, 'test_operation', mockFn)).rejects.toThrow('Test error');

			expect(mockConsole.error).toHaveBeenCalledWith(
				expect.stringContaining('"operation":"test_operation"')
			);
		});
	});

	describe('MetricsCollector', () => {
		let metricsCollector: MetricsCollector;

		beforeEach(() => {
			metricsCollector = new MetricsCollector();
		});

		afterEach(() => {
			metricsCollector.stop();
		});

		it('should collect performance metrics', () => {
			metricsCollector.addPerformanceMetric({
				operation: 'database_query',
				duration_ms: 100,
				success: true
			});

			expect(metricsCollector.getMetricsCount()).toBe(2); // Duration + counter
		});

		it('should collect business metrics', () => {
			metricsCollector.addBusinessMetric({
				event_type: 'auction_finalized',
				entity_type: 'auction',
				entity_id: 'auction-123',
				value: 1
			});

			expect(metricsCollector.getMetricsCount()).toBe(1);
		});

		it('should batch metrics for efficient storage', () => {
			// Add multiple metrics
			for (let i = 0; i < 10; i++) {
				metricsCollector.addMetric({
					metric_type: 'test',
					metric_name: `test_metric_${i}`,
					value: i
				});
			}

			expect(metricsCollector.getMetricsCount()).toBe(10);
		});
	});

	describe('Metrics utility functions', () => {
		it('should log auction processed metrics', () => {
			Metrics.auctionProcessed('auction-123', true, 150);

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"metric_name":"auction_processed_duration"')
			);
		});

		it('should log auction finalized metrics', () => {
			Metrics.auctionFinalized('auction-123', 'order-456');

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"metric_name":"auction_finalized_auction"')
			);
		});

		it('should log order created metrics', () => {
			Metrics.orderCreated('order-123', 5000);

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"metric_name":"order_created_order"')
			);
		});

		it('should log notification sent metrics', () => {
			Metrics.notificationSent('user-123', 'auction_won');

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"metric_name":"notification_sent_notification"')
			);
		});

		it('should log error metrics', () => {
			const error = new Error('Test error');
			Metrics.errorOccurred('test_operation', error, { context: 'test' });

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"metric_name":"test_operation_error_duration"')
			);
		});

		it('should log function execution metrics', () => {
			Metrics.functionExecuted('test_function', 1000, true);

			expect(mockConsole.log).toHaveBeenCalledWith(
				expect.stringContaining('"metric_name":"function_test_function_duration"')
			);
		});
	});
});
