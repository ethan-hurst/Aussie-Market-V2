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
    state: 'pending',
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

  // 1) Pay flow
  await page.goto(`/orders/${orderId}/pay`);
  await expect(page.getByRole('heading', { name: 'Complete Payment' })).toBeVisible();
  const confirmReq = page.waitForRequest('**/api/payments/confirm');
  await page.getByRole('button', { name: /Pay/ }).click();
  await confirmReq;
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));

  // 2) Verify timeline shows payment
  await expect(page.getByText('Payment Received')).toBeVisible();

  // Helper to post an action via the page (so our route stub sees it)
  async function doAction(action: string) {
    await page.evaluate(async ({ orderId, action }) => {
      await fetch(`/api/orders/${orderId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    }, { orderId, action });
    await page.reload();
  }

  // 3) Seller marks ready
  await doAction('mark_ready');
  await expect(page.getByText('Ready for Handover')).toBeVisible();

  // 4) Seller marks shipped
  await doAction('mark_shipped');
  await expect(page.getByText('Shipped')).toBeVisible();

  // 5) Buyer confirms delivery
  await doAction('confirm_delivery');
  await expect(page.getByText('Delivered')).toBeVisible();

  // 6) Buyer releases funds
  await doAction('release_funds');
  await expect(page.getByText('Funds Released')).toBeVisible();
});


