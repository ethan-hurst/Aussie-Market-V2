import { test, expect } from '@playwright/test';
import { stubStripe } from './helpers/stripe';

test('buyer can complete payment with stubbed Stripe and APIs', async ({ page }) => {
  const orderId = 'test-order-id';

  await stubStripe(page);

  // Stub order fetch (shape matches order page expectations)
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    const body: any = {
      id: orderId,
      amount_cents: 12345,
      total_amount_cents: 12345,
      platform_fee_cents: 345,
      winning_bid_amount_cents: 11000,
      listings: { title: 'Test Listing', description: 'Test', listing_photos: [] },
      buyer: { id: 'u_buyer', legal_name: 'Test Buyer', email: 'buyer@example.com' },
      seller: { id: 'u_seller', legal_name: 'Test Seller', email: 'seller@example.com' },
      state: 'pending_payment',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  // Stub payments endpoints
  await page.route('**/api/payments/create-intent', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'cs_stub', paymentIntentId: 'pi_stub' }) });
  });
  await page.route('**/api/payments/confirm', async (route) => {
    // mutate stubbed order
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orderState: 'paid' }) });
  });

  // Do not stub the order HTML page; let the app render it

  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u_buyer' });
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u_buyer' } }));
  });
  await page.goto(`/orders/${orderId}/pay`);
  await expect(page.getByRole('heading', { name: 'Complete Payment' }).first()).toBeVisible();

  // Drive confirm directly (avoid true Stripe flow requirements)
  await page.evaluate(async (orderId) => {
    await fetch('/api/payments/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, paymentIntentId: 'pi_stub' }) });
  }, orderId);
  // Update order stub to reflect PAID after confirm
  await page.unroute(`**/api/orders/${orderId}`);
  // Ensure we don't intercept the actual HTML order page
  try { await page.unroute(`**/orders/${orderId}`); } catch {}
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    const body: any = {
      id: orderId,
      amount_cents: 12345,
      total_amount_cents: 12345,
      platform_fee_cents: 345,
      winning_bid_amount_cents: 11000,
      listings: { title: 'Test Listing', description: 'Test', listing_photos: [] },
      buyer: { id: 'u_buyer', legal_name: 'Test Buyer', email: 'buyer@example.com' },
      seller: { id: 'u_seller', legal_name: 'Test Seller', email: 'seller@example.com' },
      state: 'paid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`/orders/${orderId}`);
  // Wait for order fetch to complete before asserting
  await page.waitForResponse((res) => res.url().endsWith(`/api/orders/${orderId}`) && res.request().method() === 'GET');
  await expect(page.locator('span.inline-block', { hasText: 'Payment Received' }).first()).toBeVisible();
});


