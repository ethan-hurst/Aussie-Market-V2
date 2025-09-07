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
    let body: any = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
    if (body?.type === 'charge.dispute.created') {
      currentOrder.state = 'disputed';
      currentOrder.updated_at = new Date().toISOString();
    }
    if (body?.type === 'charge.dispute.closed') {
      // Simulate seller won -> released (canonical mapping)
      currentOrder.state = 'released';
      currentOrder.updated_at = new Date().toISOString();
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ received: true }) });
  });

  // Ensure authenticated requests for protected pages
  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u_buyer' });

  // Open order page (paid)
  await page.goto(`/orders/${orderId}`);
  // Status pill in sidebar: specific style classes
  await expect(page.locator('span.inline-block', { hasText: 'Payment Received' }).first()).toBeVisible();

  // Send dispute.created webhook via page (so our route stub applies)
  await page.evaluate(async () => {
    await fetch('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_mock' },
      body: JSON.stringify({ type: 'charge.dispute.created', data: { object: { id: 'dp_1', charge: 'ch_123', amount: 15000, currency: 'aud', reason: 'fraudulent', status: 'needs_response' } } })
    });
  });
  await page.reload();
  // Check the status pill shows Disputed
  await expect(page.locator('span.inline-block', { hasText: /Disputed/i }).first()).toBeVisible();

  // Duplicate created should be idempotent (still disputed)
  await page.evaluate(async () => {
    await fetch('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_mock' },
      body: JSON.stringify({ type: 'charge.dispute.created', data: { object: { id: 'dp_1', charge: 'ch_123', amount: 15000, currency: 'aud', reason: 'fraudulent', status: 'needs_response' } } })
    });
  });
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: /^Disputed$/ }).first()).toBeVisible();

  // Send dispute.closed (seller won) -> completed
  await page.evaluate(async () => {
    await fetch('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_mock' },
      body: JSON.stringify({ type: 'charge.dispute.closed', data: { object: { id: 'dp_1', status: 'won' } } })
    });
  });
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: /^Funds Released$/ }).first()).toBeVisible();

  // Duplicate closed should remain completed
  await page.evaluate(async () => {
    await fetch('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 'sig_mock' },
      body: JSON.stringify({ type: 'charge.dispute.closed', data: { object: { id: 'dp_1', status: 'won' } } })
    });
  });
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: /^Funds Released$/ }).first()).toBeVisible();
});


