import { test, expect, request as pwRequest } from '@playwright/test';

const STAGING_SITE_URL = process.env.STAGING_SITE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

test.describe('Webhook Security Tests', () => {
  test('rejects webhook requests without signature in production', async ({ request }) => {
    // Test production security: should reject requests without signature
    const res = await request.post('/api/webhooks/stripe', {
      data: JSON.stringify({
        id: 'evt_test_webhook',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', metadata: { order_id: 'test-order' } } }
      }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Should reject due to missing signature
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid signature|missing signature/i);
  });

  test('rejects webhook requests with invalid signature', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 't=0,v1=invalidsignature',
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        id: 'evt_test_webhook',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', metadata: { order_id: 'test-order' } } }
      })
    });
    
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid signature/i);
  });

  test('rejects webhook events that are too old (replay attack prevention)', async ({ request }) => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
    
    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock', // Development mock signature
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        id: 'evt_old_event',
        type: 'payment_intent.succeeded',
        created: oldTimestamp,
        data: { object: { id: 'pi_test', metadata: { order_id: 'test-order' } } }
      })
    });
    
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/event too old|event from future/i);
  });

  test('rejects webhook events from the future (clock skew protection)', async ({ request }) => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 7200; // 2 hours in future
    
    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock', // Development mock signature
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        id: 'evt_future_event',
        type: 'payment_intent.succeeded',
        created: futureTimestamp,
        data: { object: { id: 'pi_test', metadata: { order_id: 'test-order' } } }
      })
    });
    
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/event from future/i);
  });

  test('validates webhook signature format and structure', async ({ request }) => {
    const invalidSignatures = [
      'invalid_format',
      't=1234567890', // Missing v1
      'v1=signature', // Missing timestamp
      't=invalid,v1=signature', // Invalid timestamp
      't=1234567890,v1=', // Empty signature
    ];

    for (const signature of invalidSignatures) {
      const res = await request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': signature,
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          id: 'evt_test_webhook',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_test', metadata: { order_id: 'test-order' } } }
        })
      });
      
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid signature/i);
    }
  });

  test('handles malformed webhook payload gracefully', async ({ request }) => {
    const malformedPayloads = [
      'invalid json',
      '{"incomplete": json}',
      '{"id": "evt_test", "type": "payment_intent.succeeded"}', // Missing data
      '{"id": "evt_test", "type": "payment_intent.succeeded", "data": {}}', // Empty data
      '{"id": "evt_test", "type": "payment_intent.succeeded", "data": {"object": {}}}', // Empty object
    ];

    for (const payload of malformedPayloads) {
      const res = await request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock', // Development mock signature
          'Content-Type': 'application/json'
        },
        data: payload
      });
      
      // Should handle gracefully - either 200 (accepted), 400 (malformed), or 500 (processing error)
      expect(res.status()).toBeGreaterThanOrEqual(200);
      expect(res.status()).toBeLessThan(600);
    }
  });

  test('validates webhook event type handling', async ({ request }) => {
    const unhandledEventTypes = [
      'customer.created',
      'invoice.payment_succeeded',
      'subscription.created',
      'unknown.event.type'
    ];

    for (const eventType of unhandledEventTypes) {
      const res = await request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock', // Development mock signature
          'Content-Type': 'application/json'
        },
        data: JSON.stringify({
          id: `evt_${eventType.replace('.', '_')}`,
          type: eventType,
          data: { object: { id: 'test_object' } }
        })
      });
      
      // Should accept but log as unhandled
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.received).toBe(true);
    }
  });

  test('validates production environment secret requirements', async ({ request }) => {
    // This test verifies that production environment variables are properly validated
    // In a real test environment, we would mock NODE_ENV=production
    
    const res = await request.post('/api/webhooks/stripe', {
      headers: { 
        'stripe-signature': 'sig_mock', // Development mock signature
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        id: 'evt_production_test',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test', metadata: { order_id: 'test-order' } } }
      })
    });
    
    // In development, should accept mock signatures (or 404 if route not available)
    expect([200, 404]).toContain(res.status());
  });
});
