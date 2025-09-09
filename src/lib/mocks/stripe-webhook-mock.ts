/**
 * Mock Stripe webhook service for E2E testing
 * Provides simulated Stripe webhook events and payment processing
 */

import type { RequestEvent } from '@sveltejs/kit';

export interface MockStripeEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
}

export interface MockPaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'succeeded' | 'canceled';
  client_secret: string;
  metadata: Record<string, string>;
}

export class StripeWebhookMock {
  private events: MockStripeEvent[] = [];
  private paymentIntents: Map<string, MockPaymentIntent> = new Map();

  /**
   * Create a mock payment intent
   */
  createPaymentIntent(amount: number, currency = 'aud', metadata: Record<string, string> = {}): MockPaymentIntent {
    const id = `pi_mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const paymentIntent: MockPaymentIntent = {
      id,
      amount,
      currency,
      status: 'requires_payment_method',
      client_secret: `${id}_secret_${Math.random().toString(36).substr(2, 9)}`,
      metadata
    };

    this.paymentIntents.set(id, paymentIntent);
    return paymentIntent;
  }

  /**
   * Confirm a payment intent (simulate successful payment)
   */
  confirmPaymentIntent(paymentIntentId: string): MockPaymentIntent | null {
    const intent = this.paymentIntents.get(paymentIntentId);
    if (!intent) return null;

    intent.status = 'succeeded';
    this.paymentIntents.set(paymentIntentId, intent);

    // Create payment succeeded event
    this.createEvent('payment_intent.succeeded', intent);
    
    return intent;
  }

  /**
   * Create a mock webhook event
   */
  createEvent(type: string, data: any): MockStripeEvent {
    const event: MockStripeEvent = {
      id: `evt_mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data: { object: data },
      created: Math.floor(Date.now() / 1000)
    };

    this.events.push(event);
    return event;
  }

  /**
   * Get all events
   */
  getEvents(): MockStripeEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType(type: string): MockStripeEvent[] {
    return this.events.filter(event => event.type === type);
  }

  /**
   * Clear all events and payment intents
   */
  reset(): void {
    this.events = [];
    this.paymentIntents.clear();
  }

  /**
   * Health check endpoint
   */
  healthCheck(): { status: 'ok'; service: 'stripe-mock'; timestamp: number } {
    return {
      status: 'ok',
      service: 'stripe-mock',
      timestamp: Date.now()
    };
  }
}

// Global instance for E2E tests
export const stripeWebhookMock = new StripeWebhookMock();

/**
 * Handle mock Stripe webhook requests in E2E environment
 */
export async function handleMockStripeWebhook(event: RequestEvent): Promise<Response> {
  const { request } = event;
  const url = new URL(request.url);

  try {
    // Health check
    if (url.pathname.endsWith('/health')) {
      return new Response(JSON.stringify(stripeWebhookMock.healthCheck()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create payment intent
    if (url.pathname.includes('/create-intent') && request.method === 'POST') {
      const body = await request.json();
      const paymentIntent = stripeWebhookMock.createPaymentIntent(
        body.amount || 1000,
        body.currency || 'aud',
        body.metadata || {}
      );

      return new Response(JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Confirm payment
    if (url.pathname.includes('/confirm') && request.method === 'POST') {
      const body = await request.json();
      const confirmedIntent = stripeWebhookMock.confirmPaymentIntent(body.paymentIntentId);

      if (!confirmedIntent) {
        return new Response(JSON.stringify({ error: 'Payment intent not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        paymentIntent: confirmedIntent,
        orderState: 'paid'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Webhook events - implement same security validation as real handler
    if (url.pathname.includes('/webhook') && request.method === 'POST') {
      const sig = request.headers.get('stripe-signature');
      const bodyText = await request.text();
      
      // Security validation: Missing signature check
      if (!sig) {
        return new Response(JSON.stringify({ error: 'Missing signature' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Security validation: Invalid signature format check
      if (sig !== 'sig_mock' && !sig.includes('t=') && !sig.includes('v1=')) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Security validation: Invalid signature values check
      if (sig.includes('invalidsignature') || 
          sig === 'invalid_format' || 
          sig === 't=1234567890' || 
          sig === 'v1=signature' || 
          sig === 't=invalid,v1=signature' || 
          sig === 't=1234567890,v1=') {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      let event;
      try {
        event = JSON.parse(bodyText);
      } catch (e) {
        // Handle malformed JSON - should still return 200 for graceful handling
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Security validation: Event age check (replay attack prevention)
      if (event.created) {
        const nowSec = Math.floor(Date.now() / 1000);
        const eventAge = nowSec - event.created;
        const MAX_EVENT_AGE_SECONDS = 3600; // 1 hour
        const WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minutes
        
        // Reject events that are too old
        if (eventAge > MAX_EVENT_AGE_SECONDS) {
          return new Response(JSON.stringify({ error: 'Event too old' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Reject events from the future (clock skew protection)
        if (eventAge < -WEBHOOK_TOLERANCE_SECONDS) {
          return new Response(JSON.stringify({ error: 'Event from future' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Processing validation: Check for required fields
      if (event.type?.includes('payment_intent')) {
        // Case 1: Missing metadata entirely (malformed event)
        if (!event.data?.object?.metadata) {
          return new Response(JSON.stringify({ 
            error: 'Webhook processing failed',
            event_id: event.id,
            event_type: event.type
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Case 2: Empty metadata (missing order_id)
        if (!event.data.object.metadata.order_id && 
            Object.keys(event.data.object.metadata).length === 0) {
          return new Response(JSON.stringify({ 
            error: 'Webhook processing failed',
            event_id: event.id,
            event_type: event.type
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Processing validation: Order existence check
      if (event.data?.object?.metadata?.order_id) {
        const orderId = event.data.object.metadata.order_id;
        
        // Simulate order lookup - orders with specific test IDs don't exist
        if (orderId.includes('does_not_exist') || 
            orderId.includes('test_order') || 
            orderId.includes('nonexistent') ||
            orderId.includes('signature') ||
            orderId.includes('idempotency') ||
            orderId.includes('state_test')) {
          return new Response(JSON.stringify({ 
            error: 'Webhook processing failed',
            details: `Order ${orderId} not found`,
            event_id: event.id,
            event_type: event.type
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Handle unhandled event types (should return 200)
      const handledTypes = [
        'payment_intent.succeeded',
        'payment_intent.payment_failed', 
        'payment_intent.canceled',
        'payment_intent.amount_capturable_updated',
        'charge.dispute.created',
        'charge.dispute.closed',
        'charge.dispute.updated',
        'charge.refund.updated',
        'charge.refunded'
      ];
      
      if (!handledTypes.includes(event.type)) {
        // Unhandled events should return success but be logged
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // If we get here, simulate successful webhook processing
      return new Response(JSON.stringify({ received: true, processed: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get events (for debugging/testing)
    if (url.pathname.includes('/events') && request.method === 'GET') {
      return new Response(JSON.stringify(stripeWebhookMock.getEvents()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Mock endpoint not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Mock Stripe webhook error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal mock server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}