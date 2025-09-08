import { test, expect, request as pwRequest } from '@playwright/test';

const STAGING_SITE_URL = process.env.STAGING_SITE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

test.describe('Webhook Idempotency Tests', () => {
  test('handles duplicate webhook delivery idempotently', async ({ request }) => {
    const eventId = 'evt_duplicate_test';
    const orderId = 'test-order-duplicate';
    
    const webhookPayload = {
      id: eventId,
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'pi_duplicate_test',
          amount: 1000,
          currency: 'aud',
          metadata: { order_id: orderId }
        }
      }
    };

    // First webhook delivery
    const res1 = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(webhookPayload)
    });
    
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.received).toBe(true);

    // Second webhook delivery (duplicate)
    const res2 = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(webhookPayload)
    });
    
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.received).toBe(true);
    expect(body2.idempotent).toBe(true);
  });

  test('prevents concurrent webhook processing race conditions', async ({ request }) => {
    const eventId = 'evt_concurrent_test';
    const orderId = 'test-order-concurrent';
    
    const webhookPayload = {
      id: eventId,
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'pi_concurrent_test',
          amount: 1000,
          currency: 'aud',
          metadata: { order_id: orderId }
        }
      }
    };

    // Send multiple concurrent requests
    const promises = Array.from({ length: 5 }, () => 
      request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(webhookPayload)
      })
    );

    const responses = await Promise.all(promises);
    
    // All should succeed
    responses.forEach(res => {
      expect(res.status()).toBe(200);
    });

    // At least one should be idempotent
    const bodies = await Promise.all(responses.map(res => res.json()));
    const idempotentCount = bodies.filter(body => body.idempotent).length;
    expect(idempotentCount).toBeGreaterThan(0);
  });

  test('handles order state transitions idempotently', async ({ request }) => {
    const orderId = 'test-order-state-transitions';
    
    // Test multiple payment events for the same order
    const paymentEvents = [
      {
        id: 'evt_payment_success_1',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'pi_success_1',
            amount: 1000,
            currency: 'aud',
            metadata: { order_id: orderId }
          }
        }
      },
      {
        id: 'evt_payment_success_2',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000) + 1,
        data: {
          object: {
            id: 'pi_success_2',
            amount: 1000,
            currency: 'aud',
            metadata: { order_id: orderId }
          }
        }
      }
    ];

    // Send first payment event
    const res1 = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(paymentEvents[0])
    });
    
    expect(res1.status()).toBe(200);

    // Send second payment event (should be idempotent)
    const res2 = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(paymentEvents[1])
    });
    
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.received).toBe(true);
  });

  test('validates webhook event processing order', async ({ request }) => {
    const orderId = 'test-order-processing-order';
    const baseTime = Math.floor(Date.now() / 1000);
    
    // Create events in different order
    const events = [
      {
        id: 'evt_later_event',
        type: 'payment_intent.succeeded',
        created: baseTime + 10,
        data: {
          object: {
            id: 'pi_later',
            amount: 1000,
            currency: 'aud',
            metadata: { order_id: orderId }
          }
        }
      },
      {
        id: 'evt_earlier_event',
        type: 'payment_intent.succeeded',
        created: baseTime,
        data: {
          object: {
            id: 'pi_earlier',
            amount: 1000,
            currency: 'aud',
            metadata: { order_id: orderId }
          }
        }
      }
    ];

    // Send events in reverse chronological order
    for (const event of events) {
      const res = await request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(event)
      });
      
      expect(res.status()).toBe(200);
    }
  });

  test('handles webhook event replay with different timestamps', async ({ request }) => {
    const eventId = 'evt_replay_test';
    const orderId = 'test-order-replay';
    const baseTime = Math.floor(Date.now() / 1000);
    
    const webhookPayload = {
      id: eventId,
      type: 'payment_intent.succeeded',
      created: baseTime,
      data: {
        object: {
          id: 'pi_replay_test',
          amount: 1000,
          currency: 'aud',
          metadata: { order_id: orderId }
        }
      }
    };

    // First delivery
    const res1 = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(webhookPayload)
    });
    
    expect(res1.status()).toBe(200);

    // Replay with slightly different timestamp (within tolerance)
    const replayPayload = {
      ...webhookPayload,
      created: baseTime + 1
    };

    const res2 = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(replayPayload)
    });
    
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.idempotent).toBe(true);
  });

  test('validates webhook event deduplication by event ID', async ({ request }) => {
    const eventId = 'evt_dedup_test';
    const orderId = 'test-order-dedup';
    
    const webhookPayload = {
      id: eventId,
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'pi_dedup_test',
          amount: 1000,
          currency: 'aud',
          metadata: { order_id: orderId }
        }
      }
    };

    // Send same event multiple times
    const responses = await Promise.all([
      request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(webhookPayload)
      }),
      request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(webhookPayload)
      }),
      request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(webhookPayload)
      })
    ]);

    // All should succeed
    responses.forEach(res => {
      expect(res.status()).toBe(200);
    });

    // Only first should not be idempotent
    const bodies = await Promise.all(responses.map(res => res.json()));
    const nonIdempotentCount = bodies.filter(body => !body.idempotent).length;
    expect(nonIdempotentCount).toBe(1);
  });
});
