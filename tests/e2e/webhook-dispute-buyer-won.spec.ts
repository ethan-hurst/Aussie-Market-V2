import { test, expect } from '@playwright/test';

test('webhook dispute closed (buyer won) moves order to Refunded; idempotent', async ({ page, request }) => {
  const orderId = 'e2e-order-dispute-buyer';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 20000,
    total_amount_cents: 20000,
    platform_fee_cents: 700,
    winning_bid_amount_cents: 19300,
    state: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'Dispute Buyer Won', description: 'Webhook dispute (buyer wins) flow', listing_photos: [] },
    buyer: { id: 'u_buyer', legal_name: 'Buyer Test', email: 'buyer@example.com' },
    seller: { id: 'u_seller', legal_name: 'Seller Test', email: 'seller@example.com' }
  };

  // Serve order state for UI
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
    }
    return route.continue();
  });

  // Mutate state on webhook calls
  await page.route('**/api/webhooks/stripe', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body?.type === 'charge.dispute.created') {
      currentOrder.state = 'disputed';
      currentOrder.updated_at = new Date().toISOString();
    }
    if (body?.type === 'charge.dispute.closed') {
      // Buyer won -> Stripe reports status 'lost' for merchant; server maps to 'refunded'
      currentOrder.state = 'refunded';
      currentOrder.updated_at = new Date().toISOString();
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ received: true }) });
  });

  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u_buyer' });
  await page.goto(`/orders/${orderId}`);
  await expect(page.locator('span.inline-block', { hasText: 'Payment Received' }).first()).toBeVisible();

  // Dispute created -> disputed
  await page.evaluate(async () => {
    await fetch('/api/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_mock' }, body: JSON.stringify({ type: 'charge.dispute.created', data: { object: { id: 'dp_x', charge: 'ch_1', amount: 20000, currency: 'aud', reason: 'fraudulent', status: 'needs_response' } } }) });
  });
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: /^Disputed$/ }).first()).toBeVisible();

  // Dispute closed -> buyer won -> refunded
  await page.evaluate(async () => {
    await fetch('/api/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_mock' }, body: JSON.stringify({ type: 'charge.dispute.closed', data: { object: { id: 'dp_x', status: 'lost' } } }) });
  });
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: /^Refunded$/ }).first()).toBeVisible();

  // Idempotent duplicate close
  await page.evaluate(async () => {
    await fetch('/api/webhooks/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_mock' }, body: JSON.stringify({ type: 'charge.dispute.closed', data: { object: { id: 'dp_x', status: 'lost' } } }) });
  });
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: /^Refunded$/ }).first()).toBeVisible();
});


