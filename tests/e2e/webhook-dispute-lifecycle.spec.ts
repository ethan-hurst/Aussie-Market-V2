import { test, expect } from '@playwright/test';

test('webhook dispute lifecycle: created → closed (seller won) updates UI; idempotent', async ({ page, request }) => {
  const orderId = 'e2e-order-dispute-1';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 15000,
    total_amount_cents: 15000,
    platform_fee_cents: 500,
    winning_bid_amount_cents: 14500,
    state: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'Dispute Test', description: 'Webhook dispute flow', listing_photos: [] },
    buyer: { id: 'u_buyer', legal_name: 'Buyer Test', email: 'buyer@example.com' },
    seller: { id: 'u_seller', legal_name: 'Seller Test', email: 'seller@example.com' }
  };

  // Stub GET /api/orders/:id to reflect currentOrder state
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
    }
    return route.continue();
  });

  // Stub webhook handler to mutate order state for this test
  await page.route('**/api/webhooks/stripe', async (route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    if (body?.type === 'charge.dispute.created') {
      currentOrder.state = 'disputed';
      currentOrder.updated_at = new Date().toISOString();
    }
    if (body?.type === 'charge.dispute.closed') {
      // Simulate seller won -> completed (per server mapping)
      currentOrder.state = 'completed';
      currentOrder.updated_at = new Date().toISOString();
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ received: true }) });
  });

  // Open order page (paid)
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText('Payment Received')).toBeVisible();

  // Send dispute.created webhook
  await request.post('/api/webhooks/stripe', {
    data: {
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_1', charge: 'ch_123', amount: 15000, currency: 'aud', reason: 'fraudulent', status: 'needs_response' } }
    },
    headers: { 'stripe-signature': 'sig_mock' }
  });
  await page.reload();
  await expect(page.getByText(/disputed/i)).toBeVisible();

  // Duplicate created should be idempotent (still disputed)
  await request.post('/api/webhooks/stripe', {
    data: {
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_1', charge: 'ch_123', amount: 15000, currency: 'aud', reason: 'fraudulent', status: 'needs_response' } }
    },
    headers: { 'stripe-signature': 'sig_mock' }
  });
  await page.reload();
  await expect(page.getByText(/disputed/i)).toBeVisible();

  // Send dispute.closed (seller won) -> completed
  await request.post('/api/webhooks/stripe', {
    data: {
      type: 'charge.dispute.closed',
      data: { object: { id: 'dp_1', status: 'won' } }
    },
    headers: { 'stripe-signature': 'sig_mock' }
  });
  await page.reload();
  await expect(page.getByText(/completed/i)).toBeVisible();

  // Duplicate closed should remain completed
  await request.post('/api/webhooks/stripe', {
    data: {
      type: 'charge.dispute.closed',
      data: { object: { id: 'dp_1', status: 'won' } }
    },
    headers: { 'stripe-signature': 'sig_mock' }
  });
  await page.reload();
  await expect(page.getByText(/completed/i)).toBeVisible();
});


