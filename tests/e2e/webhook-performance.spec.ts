import { test, expect, request as pwRequest } from '@playwright/test';

const STAGING_SITE_URL = process.env.STAGING_SITE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

test.describe('Webhook Performance and Load Tests', () => {
  test('handles high volume webhook processing under load', async ({ request }) => {
    const startTime = Date.now();
    const webhookCount = 50; // Process 50 webhooks concurrently
    
    const webhookPromises = Array.from({ length: webhookCount }, (_, index) => {
      const orderId = `test-load-order-${index}`;
      const paymentIntentId = `pi_load_test_${index}`;
      
      const webhookPayload = {
        id: `evt_load_test_${index}`,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: paymentIntentId,
            amount: 1000 + (index * 100), // Varying amounts
            currency: 'aud',
            metadata: { order_id: orderId }
          }
        }
      };

      return request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(webhookPayload)
      });
    });

    const responses = await Promise.all(webhookPromises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // All webhooks should be processed successfully
    responses.forEach((res, index) => {
      expect(res.status()).toBe(200);
    });

    // Performance assertion: Should process 50 webhooks in under 10 seconds
    expect(totalTime).toBeLessThan(10000);
    
    // Calculate throughput
    const throughput = (webhookCount / totalTime) * 1000; // webhooks per second
    console.log(`Processed ${webhookCount} webhooks in ${totalTime}ms (${throughput.toFixed(2)} webhooks/sec)`);
    
    // Minimum throughput requirement: at least 5 webhooks per second
    expect(throughput).toBeGreaterThan(5);
  });

  test('validates webhook processing response times', async ({ request }) => {
    const responseTimes: number[] = [];
    const testCount = 20;
    
    for (let i = 0; i < testCount; i++) {
      const startTime = Date.now();
      
      const webhookPayload = {
        id: `evt_response_time_${i}`,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `pi_response_time_${i}`,
            amount: 1000,
            currency: 'aud',
            metadata: { order_id: `test-response-time-${i}` }
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
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      responseTimes.push(responseTime);
      
      expect(res.status()).toBe(200);
    }

    // Calculate performance metrics
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    const minResponseTime = Math.min(...responseTimes);
    
    console.log(`Response time metrics:
      Average: ${avgResponseTime.toFixed(2)}ms
      Min: ${minResponseTime}ms
      Max: ${maxResponseTime}ms`);

    // Performance requirements
    expect(avgResponseTime).toBeLessThan(1000); // Average under 1 second
    expect(maxResponseTime).toBeLessThan(5000); // Max under 5 seconds
  });

  test('handles concurrent webhook processing with race conditions', async ({ request }) => {
    const orderId = 'test-race-condition-order';
    const eventId = 'evt_race_condition_test';
    
    const webhookPayload = {
      id: eventId,
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'pi_race_condition_test',
          amount: 1000,
          currency: 'aud',
          metadata: { order_id: orderId }
        }
      }
    };

    // Send 10 concurrent requests for the same webhook
    const concurrentRequests = Array.from({ length: 10 }, () => 
      request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(webhookPayload)
      })
    );

    const startTime = Date.now();
    const responses = await Promise.all(concurrentRequests);
    const endTime = Date.now();
    
    // All should succeed
    responses.forEach(res => {
      expect(res.status()).toBe(200);
    });

    // Should handle race conditions gracefully
    const bodies = await Promise.all(responses.map(res => res.json()));
    const idempotentCount = bodies.filter(body => body.idempotent).length;
    
    // At least 9 out of 10 should be idempotent (only first one processes)
    expect(idempotentCount).toBeGreaterThanOrEqual(9);
    
    // Should complete quickly even with race conditions
    expect(endTime - startTime).toBeLessThan(3000);
  });

  test('validates webhook processing under memory pressure', async ({ request }) => {
    const largeWebhookCount = 100;
    const startTime = Date.now();
    
    // Process many webhooks to test memory usage
    const webhookPromises = Array.from({ length: largeWebhookCount }, (_, index) => {
      const orderId = `test-memory-order-${index}`;
      const paymentIntentId = `pi_memory_test_${index}`;
      
      const webhookPayload = {
        id: `evt_memory_test_${index}`,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: paymentIntentId,
            amount: 1000,
            currency: 'aud',
            metadata: { 
              order_id: orderId,
              // Add some metadata to increase payload size
              description: `Test order ${index} for memory pressure testing`,
              timestamp: new Date().toISOString()
            }
          }
        }
      };

      return request.post('/api/webhooks/stripe', {
        headers: { 
          'stripe-signature': 'sig_mock',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(webhookPayload)
      });
    });

    const responses = await Promise.all(webhookPromises);
    const endTime = Date.now();
    
    // All should still succeed under memory pressure
    responses.forEach((res, index) => {
      expect(res.status()).toBe(200);
    });

    // Should maintain reasonable performance even with many webhooks
    const totalTime = endTime - startTime;
    expect(totalTime).toBeLessThan(15000); // Under 15 seconds for 100 webhooks
    
    const throughput = (largeWebhookCount / totalTime) * 1000;
    expect(throughput).toBeGreaterThan(5); // At least 5 webhooks per second
  });

  test('handles webhook processing with varying payload sizes', async ({ request }) => {
    const payloadSizes = [100, 500, 1000, 2000, 5000]; // bytes
    const responseTimes: number[] = [];
    
    for (const size of payloadSizes) {
      const startTime = Date.now();
      
      // Create payload of specified size
      const metadata = {
        order_id: `test-payload-size-${size}`,
        description: 'x'.repeat(size - 100) // Fill to target size
      };
      
      const webhookPayload = {
        id: `evt_payload_size_${size}`,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `pi_payload_size_${size}`,
            amount: 1000,
            currency: 'aud',
            metadata
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
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      responseTimes.push(responseTime);
      
      expect(res.status()).toBe(200);
      
      console.log(`Payload size ${size} bytes: ${responseTime}ms`);
    }

    // Response time should not increase dramatically with payload size
    const maxResponseTime = Math.max(...responseTimes);
    expect(maxResponseTime).toBeLessThan(2000); // Even large payloads under 2 seconds
  });

  test('validates webhook processing error handling under load', async ({ request }) => {
    const mixedWebhookCount = 30;
    const errorCount = 10;
    const successCount = 20;
    
    const webhookPromises = Array.from({ length: mixedWebhookCount }, (_, index) => {
      if (index < errorCount) {
        // Create invalid webhooks that should fail
        return request.post('/api/webhooks/stripe', {
          headers: { 
            'stripe-signature': 'invalid_signature',
            'Content-Type': 'application/json'
          },
          data: JSON.stringify({
            id: `evt_error_${index}`,
            type: 'payment_intent.succeeded',
            data: { object: { id: `pi_error_${index}` } }
          })
        });
      } else {
        // Create valid webhooks
        const webhookPayload = {
          id: `evt_success_${index}`,
          type: 'payment_intent.succeeded',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: `pi_success_${index}`,
              amount: 1000,
              currency: 'aud',
              metadata: { order_id: `test-mixed-load-${index}` }
            }
          }
        };

        return request.post('/api/webhooks/stripe', {
          headers: { 
            'stripe-signature': 'sig_mock',
            'Content-Type': 'application/json'
          },
          data: JSON.stringify(webhookPayload)
        });
      }
    });

    const responses = await Promise.all(webhookPromises);
    
    // Error webhooks should fail gracefully
    responses.slice(0, errorCount).forEach(res => {
      expect(res.status()).toBe(400);
    });
    
    // Success webhooks should still work
    responses.slice(errorCount).forEach(res => {
      expect(res.status()).toBe(200);
    });
  });
});
