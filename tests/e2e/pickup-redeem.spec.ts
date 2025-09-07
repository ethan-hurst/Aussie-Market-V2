import { test, expect } from '@playwright/test';

test('pickup redeem moves order to Delivered (idempotent)', async ({ page, request }) => {
  const orderId = 'e2e-pickup-1';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 10000,
    buyer_id: 'u_buyer',
    seller_id: 'u_seller',
    total_amount_cents: 10000,
    platform_fee_cents: 300,
    winning_bid_amount_cents: 9700,
    state: 'ready_for_handover',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'Pickup Test', description: 'Pickup redeem flow', listing_photos: [] },
    buyer: { id: 'u_buyer', legal_name: 'Buyer Test', email: 'buyer@example.com' },
    seller: { id: 'u_seller', legal_name: 'Seller Test', email: 'seller@example.com' }
  };

  // Provide order data to UI
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
    }
    return route.continue();
  });

  // Intercept pickup API to update state
  await page.route(`**/api/pickup/${orderId}`, async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body?.action === 'redeem') {
      currentOrder.state = 'delivered';
      currentOrder.updated_at = new Date().toISOString();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, state: 'delivered' }) });
    }
    if (body?.action === 'init') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code6: '123456', qr_token: 'qr123' }) });
    }
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Unsupported action' }) });
  });

  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u_buyer' });
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u_buyer' } }));
  });
  await page.goto(`/orders/${orderId}`);
  await expect(page.locator('span.inline-block', { hasText: 'Ready for Handover' }).first()).toBeVisible();

  // Perform redeem via page fetch so our route stub applies
  await page.evaluate(async (orderId) => {
    await fetch(`/api/pickup/${orderId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'redeem', code6: '123456' }) });
  }, orderId);
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: 'Delivered' }).first()).toBeVisible();

  // Idempotent second redeem
  await page.evaluate(async (orderId) => {
    await fetch(`/api/pickup/${orderId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'redeem', code6: '123456' }) });
  }, orderId);
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: 'Delivered' }).first()).toBeVisible();
});


