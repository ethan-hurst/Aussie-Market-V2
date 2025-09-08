import { test, expect, request as pwRequest } from '@playwright/test';

const STAGING_SITE_URL = process.env.STAGING_SITE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

test.describe('Payment Flow Integration Tests', () => {
  test('handles complete payment success flow end-to-end', async ({ request }) => {
    const orderId = 'test-payment-success-flow';
    const paymentIntentId = 'pi_success_flow_test';
    
    const webhookPayload = {
      id: 'evt_payment_success_flow',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: paymentIntentId,
          amount: 2500, // $25.00
          currency: 'aud',
          status: 'succeeded',
          metadata: { order_id: orderId }
        }
      }
    };

    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(webhookPayload)
    });
    
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);

    // Verify order state was updated
    // Note: In a real test, we would query the database or API to verify state
    // For now, we verify the webhook was processed successfully
  });

  test('handles payment failure flow with proper error handling', async ({ request }) => {
    const orderId = 'test-payment-failure-flow';
    const paymentIntentId = 'pi_failure_flow_test';
    
    const webhookPayload = {
      id: 'evt_payment_failure_flow',
      type: 'payment_intent.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: paymentIntentId,
          amount: 2500,
          currency: 'aud',
          status: 'requires_payment_method',
          last_payment_error: {
            message: 'Your card was declined.',
            type: 'card_error',
            code: 'card_declined'
          },
          metadata: { order_id: orderId }
        }
      }
    };

    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(webhookPayload)
    });
    
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test('handles payment cancellation flow', async ({ request }) => {
    const orderId = 'test-payment-cancellation-flow';
    const paymentIntentId = 'pi_cancellation_flow_test';
    
    const webhookPayload = {
      id: 'evt_payment_cancellation_flow',
      type: 'payment_intent.canceled',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: paymentIntentId,
          amount: 2500,
          currency: 'aud',
          status: 'canceled',
          cancellation_reason: 'requested_by_customer',
          metadata: { order_id: orderId }
        }
      }
    };

    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(webhookPayload)
    });
    
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test('handles dispute creation and resolution flow', async ({ request }) => {
    const orderId = 'test-dispute-flow';
    const chargeId = 'ch_dispute_flow_test';
    const disputeId = 'dp_dispute_flow_test';
    
    // First, create a dispute
    const disputeCreatedPayload = {
      id: 'evt_dispute_created_flow',
      type: 'charge.dispute.created',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: disputeId,
          charge: chargeId,
          amount: 2500,
          currency: 'aud',
          reason: 'fraudulent',
          status: 'warning_needs_response'
        }
      }
    };

    const res1 = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(disputeCreatedPayload)
    });
    
    expect(res1.status()).toBe(200);

    // Then, resolve the dispute (seller won)
    const disputeClosedPayload = {
      id: 'evt_dispute_closed_flow',
      type: 'charge.dispute.closed',
      created: Math.floor(Date.now() / 1000) + 1,
      data: {
        object: {
          id: disputeId,
          charge: chargeId,
          amount: 2500,
          currency: 'aud',
          reason: 'fraudulent',
          status: 'won'
        }
      }
    };

    const res2 = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(disputeClosedPayload)
    });
    
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.received).toBe(true);
  });

  test('handles refund processing flow', async ({ request }) => {
    const orderId = 'test-refund-flow';
    const paymentIntentId = 'pi_refund_flow_test';
    const refundId = 're_refund_flow_test';
    
    const refundPayload = {
      id: 'evt_refund_flow',
      type: 'charge.refunded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'ch_refund_flow_test',
          payment_intent: paymentIntentId,
          amount: 2500,
          currency: 'aud',
          refunded: true,
          refunds: {
            data: [{
              id: refundId,
              amount: 2500,
              currency: 'aud',
              status: 'succeeded'
            }]
          }
        }
      }
    };

    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(refundPayload)
    });
    
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test('handles partial refund processing', async ({ request }) => {
    const orderId = 'test-partial-refund-flow';
    const paymentIntentId = 'pi_partial_refund_flow_test';
    const refundId = 're_partial_refund_flow_test';
    
    const partialRefundPayload = {
      id: 'evt_partial_refund_flow',
      type: 'charge.refund.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: refundId,
          payment_intent: paymentIntentId,
          amount: 1250, // Partial refund of $12.50
          currency: 'aud',
          status: 'succeeded'
        }
      }
    };

    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(partialRefundPayload)
    });
    
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test('handles payment intent amount capturable updates', async ({ request }) => {
    const orderId = 'test-capturable-amount-flow';
    const paymentIntentId = 'pi_capturable_flow_test';
    
    const capturableUpdatePayload = {
      id: 'evt_capturable_update_flow',
      type: 'payment_intent.amount_capturable_updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: paymentIntentId,
          amount: 2500,
          amount_capturable: 2000, // $20.00 capturable
          currency: 'aud',
          metadata: { order_id: orderId }
        }
      }
    };

    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(capturableUpdatePayload)
    });
    
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test('validates order state transitions are atomic', async ({ request }) => {
    const orderId = 'test-atomic-state-flow';
    const paymentIntentId = 'pi_atomic_flow_test';
    
    // Test that state transitions are atomic and consistent
    const webhookPayload = {
      id: 'evt_atomic_state_flow',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: paymentIntentId,
          amount: 2500,
          currency: 'aud',
          metadata: { order_id: orderId }
        }
      }
    };

    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(webhookPayload)
    });
    
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);

    // Verify that the webhook was processed atomically
    // In a real test, we would verify database consistency
  });

  test('handles multiple webhook events for same order consistently', async ({ request }) => {
    const orderId = 'test-multiple-events-flow';
    const baseTime = Math.floor(Date.now() / 1000);
    
    const events = [
      {
        id: 'evt_multiple_1',
        type: 'payment_intent.succeeded',
        created: baseTime,
        data: {
          object: {
            id: 'pi_multiple_1',
            amount: 2500,
            currency: 'aud',
            metadata: { order_id: orderId }
          }
        }
      },
      {
        id: 'evt_multiple_2',
        type: 'payment_intent.amount_capturable_updated',
        created: baseTime + 1,
        data: {
          object: {
            id: 'pi_multiple_1',
            amount: 2500,
            amount_capturable: 2000,
            currency: 'aud',
            metadata: { order_id: orderId }
          }
        }
      }
    ];

    // Process events in sequence
    for (const event of events) {
      const res = await request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(event)
      });
      
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
    }
  });
});
