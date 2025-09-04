import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RetryStrategies, retryWithStrategy, RetryOperations } from './retry-strategies';

// Mock console methods
const mockConsole = {
	log: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn()
};

describe('Retry Strategies', () => {
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

	describe('RetryStrategies.classifyError', () => {
		it('should classify connection errors as retryable', () => {
			const error = new Error('Connection timeout');
			const result = RetryStrategies.classifyError(error);
			
			expect(result.isRetryable).toBe(true);
			expect(result.reason).toContain('connection');
		});

		it('should classify rate limiting as retryable', () => {
			const error = { code: 429, message: 'Too many requests' };
			const result = RetryStrategies.classifyError(error);
			
			expect(result.isRetryable).toBe(true);
			expect(result.reason).toContain('Rate limited');
		});

		it('should classify server errors as retryable', () => {
			const error = { code: 500, message: 'Internal server error' };
			const result = RetryStrategies.classifyError(error);
			
			expect(result.isRetryable).toBe(true);
			expect(result.reason).toContain('Server error');
		});

		it('should classify client errors as not retryable', () => {
			const error = { code: 400, message: 'Bad request' };
			const result = RetryStrategies.classifyError(error);
			
			expect(result.isRetryable).toBe(false);
			expect(result.reason).toContain('Client error');
		});

		it('should classify validation errors as not retryable', () => {
			const error = new Error('Validation failed: invalid input');
			const result = RetryStrategies.classifyError(error);
			
			expect(result.isRetryable).toBe(false);
			expect(result.reason).toContain('Client error');
		});

		it('should classify database constraint errors as retryable', () => {
			const error = new Error('duplicate key value violates unique constraint');
			const result = RetryStrategies.classifyError(error);
			
			expect(result.isRetryable).toBe(true);
			expect(result.reason).toContain('Database constraint');
		});

		it('should default unknown errors to retryable', () => {
			const error = new Error('Some unknown error');
			const result = RetryStrategies.classifyError(error);
			
			expect(result.isRetryable).toBe(true);
			expect(result.reason).toContain('Unknown error');
		});
	});

	describe('RetryStrategies.calculateDelay', () => {
		it('should calculate exponential backoff delay', () => {
			const config = {
				maxRetries: 3,
				baseDelayMs: 100,
				maxDelayMs: 1000,
				backoffMultiplier: 2
			};

			const delay1 = RetryStrategies.calculateDelay(1, config);
			const delay2 = RetryStrategies.calculateDelay(2, config);
			const delay3 = RetryStrategies.calculateDelay(3, config);

			expect(delay1).toBeGreaterThanOrEqual(100);
			expect(delay2).toBeGreaterThanOrEqual(200);
			expect(delay3).toBeGreaterThanOrEqual(400);
		});

		it('should respect max delay cap', () => {
			const config = {
				maxRetries: 3,
				baseDelayMs: 100,
				maxDelayMs: 300,
				backoffMultiplier: 2
			};

			const delay = RetryStrategies.calculateDelay(5, config);
			expect(delay).toBeLessThanOrEqual(300);
		});

		it('should add jitter to delay', () => {
			const config = {
				maxRetries: 3,
				baseDelayMs: 100,
				maxDelayMs: 1000,
				backoffMultiplier: 2,
				jitterMs: 50
			};

			const delay1 = RetryStrategies.calculateDelay(1, config);
			const delay2 = RetryStrategies.calculateDelay(1, config);

			// With jitter, delays should be different
			expect(delay1).not.toBe(delay2);
			expect(delay1).toBeGreaterThanOrEqual(100);
			expect(delay1).toBeLessThanOrEqual(150);
		});

		it('should use suggested delay when provided', () => {
			const config = {
				maxRetries: 3,
				baseDelayMs: 100,
				maxDelayMs: 1000,
				backoffMultiplier: 2
			};

			const delay = RetryStrategies.calculateDelay(1, config, 500);
			expect(delay).toBeGreaterThanOrEqual(500);
		});
	});

	describe('RetryStrategies.shouldRetry', () => {
		it('should not retry when max attempts exceeded', () => {
			const error = new Error('Connection timeout');
			const result = RetryStrategies.shouldRetry(4, 3, error);
			
			expect(result).toBe(false);
		});

		it('should retry when within limits and error is retryable', () => {
			const error = new Error('Connection timeout');
			const result = RetryStrategies.shouldRetry(2, 3, error);
			
			expect(result).toBe(true);
		});

		it('should not retry when error is not retryable', () => {
			const error = new Error('Validation failed');
			const result = RetryStrategies.shouldRetry(1, 3, error);
			
			expect(result).toBe(false);
		});
	});

	describe('retryWithStrategy', () => {
		it('should succeed on first attempt', async () => {
			const mockFn = vi.fn().mockResolvedValue('success');
			const config = {
				maxRetries: 3,
				baseDelayMs: 100,
				maxDelayMs: 1000,
				backoffMultiplier: 2
			};

			const result = await retryWithStrategy('test_operation', mockFn, config);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(1);
		});

		it('should retry on transient errors and eventually succeed', async () => {
			const mockFn = vi.fn()
				.mockRejectedValueOnce(new Error('Connection timeout'))
				.mockRejectedValueOnce(new Error('Connection timeout'))
				.mockResolvedValue('success');
			
			const config = {
				maxRetries: 3,
				baseDelayMs: 10, // Fast for testing
				maxDelayMs: 100,
				backoffMultiplier: 2
			};

			const result = await retryWithStrategy('test_operation', mockFn, config);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(3);
		});

		it('should fail permanently on non-retryable errors', async () => {
			const error = new Error('Validation failed');
			const mockFn = vi.fn().mockRejectedValue(error);
			
			const config = {
				maxRetries: 3,
				baseDelayMs: 10,
				maxDelayMs: 100,
				backoffMultiplier: 2
			};

			await expect(retryWithStrategy('test_operation', mockFn, config))
				.rejects.toThrow('Validation failed');
			
			expect(mockFn).toHaveBeenCalledTimes(1);
		});

		it('should exhaust retries and fail', async () => {
			const error = new Error('Connection timeout');
			const mockFn = vi.fn().mockRejectedValue(error);
			
			const config = {
				maxRetries: 2,
				baseDelayMs: 10,
				maxDelayMs: 100,
				backoffMultiplier: 2
			};

			await expect(retryWithStrategy('test_operation', mockFn, config))
				.rejects.toThrow('Connection timeout');
			
			expect(mockFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
		});

		it('should log retry attempts when logger provided', async () => {
			const mockLogger = {
				debug: vi.fn(),
				warn: vi.fn(),
				error: vi.fn()
			};

			const error = new Error('Connection timeout');
			const mockFn = vi.fn().mockRejectedValue(error);
			
			const config = {
				maxRetries: 1,
				baseDelayMs: 10,
				maxDelayMs: 100,
				backoffMultiplier: 2
			};

			await expect(retryWithStrategy('test_operation', mockFn, config, mockLogger))
				.rejects.toThrow('Connection timeout');
			
			expect(mockLogger.debug).toHaveBeenCalled();
			expect(mockLogger.warn).toHaveBeenCalled();
			expect(mockLogger.error).toHaveBeenCalled();
		});
	});

	describe('RetryOperations', () => {
		it('should use database config for database operations', async () => {
			const mockFn = vi.fn().mockResolvedValue('success');
			const mockLogger = { debug: vi.fn() };

			const result = await RetryOperations.database('test_db_op', mockFn, mockLogger);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(1);
		});

		it('should use critical config for critical operations', async () => {
			const mockFn = vi.fn().mockResolvedValue('success');
			const mockLogger = { debug: vi.fn() };

			const result = await RetryOperations.critical('test_critical_op', mockFn, mockLogger);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(1);
		});

		it('should use notification config for notification operations', async () => {
			const mockFn = vi.fn().mockResolvedValue('success');
			const mockLogger = { debug: vi.fn() };

			const result = await RetryOperations.notification('test_notification_op', mockFn, mockLogger);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(1);
		});

		it('should use external API config for external API operations', async () => {
			const mockFn = vi.fn().mockResolvedValue('success');
			const mockLogger = { debug: vi.fn() };

			const result = await RetryOperations.externalApi('test_api_op', mockFn, mockLogger);

			expect(result).toBe('success');
			expect(mockFn).toHaveBeenCalledTimes(1);
		});
	});
});
