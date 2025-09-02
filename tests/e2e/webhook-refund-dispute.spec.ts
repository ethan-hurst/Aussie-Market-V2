import { test, expect } from '@playwright/test';

test('webhook refund updates order UI to Refunded (idempotent)', async ({ page, request }) => {
  const orderId = 'e2e-order-refund-1';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 12345,
    total_amount_cents: 12345,
    platform_fee_cents: 345,
    winning_bid_amount_cents: 12000,
    state: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'Refund Test', description: 'Webhook refund flow', listing_photos: [] },
    buyer: { id: 'u_buyer', legal_name: 'Buyer Test', email: 'buyer@example.com' },
    seller: { id: 'u_seller', legal_name: 'Seller Test', email: 'seller@example.com' }
  };

  // Stub orders and webhook route
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
    }
    return route.continue();
  });

  await page.route('**/api/webhooks/stripe', async (route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    if (body?.type === 'charge.refund.updated') {
      currentOrder.state = 'refunded';
      currentOrder.updated_at = new Date().toISOString();
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ received: true }) });
  });

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText('Payment Received')).toBeVisible();

  // Send refund webhook (simulated)
  await request.post('/api/webhooks/stripe', {
    data: {
      type: 'charge.refund.updated',
      data: { object: { id: 're_1', amount: 500, currency: 'aud', payment_intent: 'pi_123' } }
    },
    headers: { 'stripe-signature': 'sig_mock' }
  });

  await page.reload();
  await expect(page.getByText('Refunded')).toBeVisible();

  // Duplicate webhook should keep state Refunded
  await request.post('/api/webhooks/stripe', {
    data: {
      type: 'charge.refund.updated',
      data: { object: { id: 're_1', amount: 500, currency: 'aud', payment_intent: 'pi_123' } }
    },
    headers: { 'stripe-signature': 'sig_mock' }
  });
  await page.reload();
  await expect(page.getByText('Refunded')).toBeVisible();
});


