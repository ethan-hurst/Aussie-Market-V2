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

    // Webhook events
    if (url.pathname.includes('/webhook') && request.method === 'POST') {
      const body = await request.json();
      
      // Echo back the webhook event as if it was processed
      return new Response(JSON.stringify({ received: true }), {
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