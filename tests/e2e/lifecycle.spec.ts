import { test, expect } from '@playwright/test';
import { stubStripe } from './helpers/stripe';

test('full purchase lifecycle: pay → ready → shipped → delivered → released', async ({ page }) => {
  const orderId = 'e2e-order-1';

  // In-memory order state for this test
  const currentOrder = {
    id: orderId,
    amount_cents: 12345,
    total_amount_cents: 12345,
    platform_fee_cents: 345,
    winning_bid_amount_cents: 12000,
    state: 'pending_payment',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: {
      title: 'E2E Listing',
      description: 'End-to-end flow test',
      listing_photos: []
    },
    buyer: { id: 'u_buyer', legal_name: 'Buyer Test', email: 'buyer@example.com' },
    seller: { id: 'u_seller', legal_name: 'Seller Test', email: 'seller@example.com' }
  } as any;

  // Stub API routes used by the UI for this order
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
    }
    if (req.method() === 'POST') {
      try {
        const body = req.postDataJSON() || {};
        switch (body.action) {
          case 'mark_ready':
            currentOrder.state = 'ready_for_handover';
            break;
          case 'mark_shipped':
            currentOrder.state = 'shipped';
            break;
          case 'confirm_delivery':
            currentOrder.state = 'delivered';
            break;
          case 'release_funds':
            currentOrder.state = 'released';
            break;
          default:
            break;
        }
        currentOrder.updated_at = new Date().toISOString();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, state: currentOrder.state }) });
      } catch {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, state: currentOrder.state }) });
      }
    }
    return route.continue();
  });

  // Stub payments endpoints
  await page.route('**/api/payments/create-intent', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'cs_stub', paymentIntentId: 'pi_stub' }) });
  });
  await page.route('**/api/payments/confirm', async (route) => {
    currentOrder.state = 'paid';
    currentOrder.updated_at = new Date().toISOString();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orderState: 'paid' }) });
  });

  // Shipments events fetch (return empty array)
  await page.route(`**/api/shipments/${orderId}/events`, async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) });
  });

  // Stripe and payments routes
  await stubStripe(page);
  await page.route('**/api/payments/confirm', async (route) => {
    // Mark paid on confirm
    currentOrder.state = 'paid';
    currentOrder.updated_at = new Date().toISOString();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orderState: 'paid' }) });
  });

  // (GET is already handled in the combined route above)

  // Auth header for protected routes
  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u_buyer' });

  // 1) Pay flow
  await page.goto(`/orders/${orderId}/pay`);
  await expect(page.locator('div.bg-gradient-to-r').getByRole('heading', { name: 'Complete Payment' })).toBeVisible();
  // Drive confirm directly via API to avoid external Stripe dependency in tests
  await page.evaluate(async (orderId) => {
    await fetch('/api/payments/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, paymentIntentId: 'pi_stub' }) });
  }, orderId);
  // Navigate to order details after confirming
  await page.goto(`/orders/${orderId}`);

  // 2) Verify timeline shows payment
  await expect(page.locator('span.inline-block', { hasText: 'Payment Received' }).first()).toBeVisible();

  // Helper to post an action via the page with appropriate user role
  async function doAction(action: string, as: 'buyer' | 'seller') {
    const userId = as === 'seller' ? 'u_seller' : 'u_buyer';
    await page.evaluate(async ({ orderId, action, userId }) => {
      await fetch(`/api/orders/${orderId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user-id': userId }, body: JSON.stringify({ action }) });
    }, { orderId, action, userId });
    await page.reload();
  }

  // 3) Seller marks ready
  await doAction('mark_ready', 'seller');
  await expect(page.locator('span.inline-block', { hasText: 'Ready for Handover' }).first()).toBeVisible();

  // 4) Seller marks shipped
  await doAction('mark_shipped', 'seller');
  await expect(page.locator('span.inline-block', { hasText: 'Shipped' }).first()).toBeVisible();

  // 5) Buyer confirms delivery
  await doAction('confirm_delivery', 'buyer');
  await expect(page.locator('span.inline-block', { hasText: 'Delivered' }).first()).toBeVisible();

  // 6) Buyer releases funds
  await doAction('release_funds', 'buyer');
  await expect(page.locator('span.inline-block', { hasText: 'Funds Released' }).first()).toBeVisible();
});


