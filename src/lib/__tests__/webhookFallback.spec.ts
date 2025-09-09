import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookFallbackManager, pollOrderStatus } from '$lib/webhookFallback';

// Mock the http module
vi.mock('$lib/http', () => ({
  safeFetch: vi.fn()
}));

// Mock the errors module
vi.mock('$lib/errors', () => ({
  mapApiErrorToMessage: vi.fn((error) => `Mapped: ${error.message || error}`)
}));

describe('WebhookFallbackManager', () => {
  let manager: WebhookFallbackManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new WebhookFallbackManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    manager.stopAllPolling();
    vi.useRealTimers();
  });

  describe('startPolling', () => {
    it('should poll order status until final state', async () => {
      const { safeFetch } = await import('$lib/http');
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        text: vi.fn().mockResolvedValue(JSON.stringify({ 
          id: 'order_123', 
          state: 'paid',
          updated_at: '2024-01-01T00:00:00Z'
        }))
      };
      
      (safeFetch as any).mockResolvedValue(mockResponse);

      const onComplete = vi.fn();
      const resultPromise = manager.startPolling('order_123', {
        maxPollingAttempts: 5,
        pollingInterval: 100,
        onComplete
      });

      // Fast-forward timers to trigger the poll
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.finalStatus).toEqual({
        id: 'order_123',
        state: 'paid',
        updated_at: '2024-01-01T00:00:00Z'
      });
      expect(onComplete).toHaveBeenCalled();
    });

    it('should respect maximum polling attempts', async () => {
      const { safeFetch } = await import('$lib/http');
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        text: vi.fn().mockResolvedValue(JSON.stringify({ 
          id: 'order_123', 
          state: 'pending',
          updated_at: '2024-01-01T00:00:00Z'
        }))
      };
      
      (safeFetch as any).mockResolvedValue(mockResponse);

      const onError = vi.fn();
      const resultPromise = manager.startPolling('order_123', {
        maxPollingAttempts: 2,
        pollingInterval: 100,
        onError
      });

      // Fast-forward timers multiple times
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(100);
        await Promise.resolve();
      }

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum polling attempts reached');
      expect(onError).toHaveBeenCalled();
    });

    it('should respect maximum total duration', async () => {
      const { safeFetch } = await import('$lib/http');
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        text: vi.fn().mockResolvedValue(JSON.stringify({ 
          id: 'order_123', 
          state: 'pending',
          updated_at: '2024-01-01T00:00:00Z'
        }))
      };
      
      (safeFetch as any).mockResolvedValue(mockResponse);

      const onError = vi.fn();
      const resultPromise = manager.startPolling('order_123', {
        maxPollingAttempts: 100,
        pollingInterval: 100,
        maxTotalDuration: 500, // 500ms max duration
        onError
      });

      // Fast-forward past the max duration
      vi.advanceTimersByTime(600);
      await Promise.resolve();

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum polling duration exceeded');
      expect(onError).toHaveBeenCalled();
    });

    it('should use exponential backoff when enabled', async () => {
      const { safeFetch } = await import('$lib/http');
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        text: vi.fn().mockResolvedValue(JSON.stringify({ 
          id: 'order_123', 
          state: 'pending',
          updated_at: '2024-01-01T00:00:00Z'
        }))
      };
      
      (safeFetch as any).mockResolvedValue(mockResponse);

      manager.startPolling('order_123', {
        maxPollingAttempts: 3,
        pollingInterval: 100,
        exponentialBackoff: true,
        maxTotalDuration: 10000
      });

      // First poll happens immediately
      expect(safeFetch).toHaveBeenCalledTimes(1);

      // Second poll after 100ms
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      expect(safeFetch).toHaveBeenCalledTimes(2);

      // Third poll after 150ms (1.5x backoff)
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      expect(safeFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle HTTP errors gracefully', async () => {
      const { safeFetch } = await import('$lib/http');
      (safeFetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const onError = vi.fn();
      const resultPromise = manager.startPolling('order_123', {
        maxPollingAttempts: 1,
        onError
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get order status');
      expect(onError).toHaveBeenCalled();
    });

    it('should handle JSON parsing errors', async () => {
      const { safeFetch } = await import('$lib/http');
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        text: vi.fn().mockResolvedValue('invalid json')
      };
      
      (safeFetch as any).mockResolvedValue(mockResponse);

      const onError = vi.fn();
      const resultPromise = manager.startPolling('order_123', {
        maxPollingAttempts: 1,
        onError
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should handle empty response body', async () => {
      const { safeFetch } = await import('$lib/http');
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn()
            .mockReturnValueOnce('0') // content-length
            .mockReturnValue('application/json')
        },
        text: vi.fn().mockResolvedValue('')
      };
      
      (safeFetch as any).mockResolvedValue(mockResponse);

      const onError = vi.fn();
      const resultPromise = manager.startPolling('order_123', {
        maxPollingAttempts: 1,
        onError
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should call onStatusUpdate for non-final states', async () => {
      const { safeFetch } = await import('$lib/http');
      let callCount = 0;
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        text: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve(JSON.stringify({ 
            id: 'order_123', 
            state: callCount === 1 ? 'pending' : 'paid',
            updated_at: '2024-01-01T00:00:00Z'
          }));
        })
      };
      
      (safeFetch as any).mockResolvedValue(mockResponse);

      const onStatusUpdate = vi.fn();
      const resultPromise = manager.startPolling('order_123', {
        maxPollingAttempts: 5,
        pollingInterval: 100,
        onStatusUpdate
      });

      // Run enough timers for the first poll (pending) and second poll (paid)
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      vi.advanceTimersByTime(100);
      await Promise.resolve();

      await resultPromise;

      expect(onStatusUpdate).toHaveBeenCalledWith({
        id: 'order_123',
        state: 'pending',
        updated_at: '2024-01-01T00:00:00Z'
      });
    });
  });

  describe('stopPolling', () => {
    it('should stop active polling for specific order', async () => {
      const { safeFetch } = await import('$lib/http');
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        text: vi.fn().mockResolvedValue(JSON.stringify({ 
          id: 'order_123', 
          state: 'pending',
          updated_at: '2024-01-01T00:00:00Z'
        }))
      };
      
      (safeFetch as any).mockResolvedValue(mockResponse);

      manager.startPolling('order_123', {
        maxPollingAttempts: 10,
        pollingInterval: 100
      });

      expect(manager.getPollingStatus('order_123').isPolling).toBe(true);

      manager.stopPolling('order_123');

      expect(manager.getPollingStatus('order_123').isPolling).toBe(false);
    });
  });

  describe('getPollingStatus', () => {
    it('should return correct polling status', () => {
      expect(manager.getPollingStatus('order_123')).toEqual({
        isPolling: false,
        attempts: 0,
        elapsedTime: 0
      });

      manager.startPolling('order_123', {
        maxPollingAttempts: 10,
        pollingInterval: 1000
      });

      const status = manager.getPollingStatus('order_123');
      expect(status.isPolling).toBe(true);
      expect(status.attempts).toBe(1);
      expect(status.elapsedTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('memory management', () => {
    it('should clean up polling data when stopped', () => {
      manager.startPolling('order_123', {
        maxPollingAttempts: 10,
        pollingInterval: 1000
      });

      manager.startPolling('order_456', {
        maxPollingAttempts: 10,
        pollingInterval: 1000
      });

      expect(manager.getActivePollingOrders()).toContain('order_123');
      expect(manager.getActivePollingOrders()).toContain('order_456');

      manager.stopPolling('order_123');

      expect(manager.getActivePollingOrders()).not.toContain('order_123');
      expect(manager.getActivePollingOrders()).toContain('order_456');

      manager.stopAllPolling();

      expect(manager.getActivePollingOrders()).toHaveLength(0);
    });

    it('should prevent memory leaks with multiple polling sessions', () => {
      // Start many polling sessions
      for (let i = 0; i < 100; i++) {
        manager.startPolling(`order_${i}`, {
          maxPollingAttempts: 1,
          pollingInterval: 1000
        });
      }

      expect(manager.getActivePollingOrders()).toHaveLength(100);

      manager.stopAllPolling();

      expect(manager.getActivePollingOrders()).toHaveLength(0);
    });
  });
});

describe('pollOrderStatus convenience function', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should work as a convenience wrapper', async () => {
    const { safeFetch } = await import('$lib/http');
    const mockResponse = {
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue('application/json')
      },
      text: vi.fn().mockResolvedValue(JSON.stringify({ 
        id: 'order_123', 
        state: 'paid',
        updated_at: '2024-01-01T00:00:00Z'
      }))
    };
    
    (safeFetch as any).mockResolvedValue(mockResponse);

    const resultPromise = pollOrderStatus('order_123');

    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.finalStatus?.state).toBe('paid');
  });
});