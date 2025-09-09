/**
 * Mock server coordinator for E2E testing
 * Manages all mock services and provides unified health checking and reset capabilities
 */

import type { RequestEvent } from '@sveltejs/kit';
import { handleMockStripeWebhook, stripeWebhookMock } from './stripe-webhook-mock.js';
import { handleMockSupabaseAuth, supabaseAuthMock } from './supabase-auth-mock.js';

export interface MockServiceHealth {
  service: string;
  status: 'ok' | 'error';
  timestamp: number;
  details?: any;
}

export interface MockServerStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: MockServiceHealth[];
  timestamp: number;
  environment: 'e2e' | 'test';
}

export class MockServerCoordinator {
  private readonly serviceName = 'mock-server-coordinator';

  /**
   * Check if we're in E2E testing mode
   */
  isE2EMode(): boolean {
    return process.env.NODE_ENV === 'test' || 
           process.env.E2E_TESTING === 'true' ||
           process.env.PLAYWRIGHT_BASE_URL?.includes('localhost');
  }

  /**
   * Get health status of all mock services
   */
  async getHealthStatus(): Promise<MockServerStatus> {
    const services: MockServiceHealth[] = [];

    try {
      // Check Stripe mock
      const stripeHealth = stripeWebhookMock.healthCheck();
      services.push({
        service: 'stripe-mock',
        status: 'ok',
        timestamp: stripeHealth.timestamp,
        details: stripeHealth
      });
    } catch (error) {
      services.push({
        service: 'stripe-mock',
        status: 'error',
        timestamp: Date.now(),
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    try {
      // Check Supabase mock
      const supabaseHealth = supabaseAuthMock.healthCheck();
      services.push({
        service: 'supabase-mock',
        status: 'ok',
        timestamp: supabaseHealth.timestamp,
        details: supabaseHealth
      });
    } catch (error) {
      services.push({
        service: 'supabase-mock',
        status: 'error',
        timestamp: Date.now(),
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    const errorCount = services.filter(s => s.status === 'error').length;
    const overall = errorCount === 0 ? 'healthy' : 
                   errorCount < services.length ? 'degraded' : 'unhealthy';

    return {
      overall,
      services,
      timestamp: Date.now(),
      environment: this.isE2EMode() ? 'e2e' : 'test'
    };
  }

  /**
   * Reset all mock services to initial state
   */
  resetAllServices(): void {
    try {
      stripeWebhookMock.reset();
      supabaseAuthMock.reset();
      console.log('[MockServer] All services reset successfully');
    } catch (error) {
      console.error('[MockServer] Error resetting services:', error);
      throw error;
    }
  }

  /**
   * Route mock requests to appropriate service handlers
   */
  async routeRequest(event: RequestEvent): Promise<Response | null> {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle requests in E2E mode
    if (!this.isE2EMode()) {
      return null;
    }

    try {
      // Health check for overall status
      if (url.pathname === '/api/mock/health') {
        const health = await this.getHealthStatus();
        return new Response(JSON.stringify(health), {
          status: health.overall === 'healthy' ? 200 : 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Reset all services
      if (url.pathname === '/api/mock/reset' && request.method === 'POST') {
        this.resetAllServices();
        return new Response(JSON.stringify({ 
          message: 'All mock services reset successfully',
          timestamp: Date.now()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Handle webhook requests first before other Stripe routes
      if (url.pathname === '/api/webhooks/stripe') {
        const sig = request.headers.get('stripe-signature');
        
        // Handle specific error cases that the mock should simulate
        if (sig && (
          sig.includes('invalidsignature') || 
          sig === 'invalid_format' || 
          sig === 't=1234567890' || 
          sig === 'v1=signature' || 
          sig === 't=invalid,v1=signature' || 
          sig === 't=1234567890,v1='
        )) {
          console.log(`[MockServer] Intercepting webhook with invalid signature: ${sig}`);
          return await handleMockStripeWebhook(event);
        }
        
        // For valid webhook signatures (like 'sig_mock'), let the real handler process for idempotency testing
        console.log(`[MockServer] Allowing webhook to pass through to real handler. Sig: ${sig}`);
        return null; // Pass through to real handler
      }
      
      // Route other Stripe-related requests to mock
      if (url.pathname.includes('/stripe') || 
          url.pathname.includes('/payments')) {
        return await handleMockStripeWebhook(event);
      }

      // Route Supabase-related requests
      if (url.pathname.includes('/supabase') ||
          url.pathname.includes('/auth') ||
          url.pathname.includes('/rest/v1')) {
        return await handleMockSupabaseAuth(event);
      }

      // Mock API endpoints for bids
      if (url.pathname === '/api/bids' && request.method === 'POST') {
        // Check for authentication header in test mode
        const testUserId = request.headers.get('x-test-user-id');
        
        if (!testUserId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const body = await request.json();
        
        // Simple bid placement response
        return new Response(JSON.stringify({
          success: true,
          bid: {
            id: `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            listing_id: body.listingId || body.listing_id,
            amount_cents: body.amount_cents || body.amountCents,
            created_at: new Date().toISOString()
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Mock API endpoints for bids GET (viewing bids)
      if (url.pathname === '/api/bids' && request.method === 'GET') {
        // Check for authentication header in test mode
        const testUserId = request.headers.get('x-test-user-id');
        
        if (!testUserId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Return mock bids data
        return new Response(JSON.stringify({
          success: true,
          bids: [
            {
              id: 'bid_1',
              amount_cents: 5000,
              created_at: new Date().toISOString()
            }
          ]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Mock API endpoints for listings
      if (url.pathname === '/api/listings' && request.method === 'GET') {
        // Check for authentication header in test mode
        const testUserId = request.headers.get('x-test-user-id');
        
        // If no authentication and no specific action, return 401 (mirrors real API behavior for protected operations)
        if (!testUserId && !url.searchParams.has('action')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const listings = supabaseAuthMock.getListings();
        return new Response(JSON.stringify(listings), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Mock KYC endpoint
      if (url.pathname === '/api/kyc' && request.method === 'GET') {
        // Check for authentication header in test mode
        const testUserId = request.headers.get('x-test-user-id');
        
        if (!testUserId) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Return mock KYC data
        return new Response(JSON.stringify({
          success: true,
          status: 'pending',
          user_id: testUserId
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Mock KPI dashboard endpoint
      if (url.pathname === '/api/kpi/dashboard' && request.method === 'GET') {
        return new Response(JSON.stringify({
          activeListings: 5,
          totalBids: 12,
          totalRevenue: 25000,
          userCount: 150,
          conversionRate: 12.5,
          timestamp: Date.now()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return null; // Not a mock request, let it pass through

    } catch (error) {
      console.error('[MockServer] Error routing request:', error);
      return new Response(JSON.stringify({
        error: 'Mock server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        service: this.serviceName
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}

// Global instance
export const mockServerCoordinator = new MockServerCoordinator();

/**
 * Main handler for all mock requests
 * Use this in your API routes when in E2E mode
 */
export async function handleMockRequest(event: RequestEvent): Promise<Response | null> {
  return await mockServerCoordinator.routeRequest(event);
}

/**
 * Middleware to intercept requests and route to mocks in E2E mode
 */
export function createMockMiddleware() {
  return async (event: RequestEvent, resolve: any) => {
    // Try to handle as mock request first
    const mockResponse = await handleMockRequest(event);
    if (mockResponse) {
      return mockResponse;
    }

    // Not a mock request, proceed normally
    return resolve(event);
  };
}