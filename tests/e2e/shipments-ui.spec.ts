import { test, expect } from '@playwright/test';

test('seller can add shipment and tracking event; timeline updates', async ({ page }) => {
  const orderId = 'ui-ship-1';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 15000,
    buyer_id: 'u_buyer',
    seller_id: 'u_seller',
    state: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'Ship UI', description: 'Ship test', listing_photos: [] },
    buyer: { id: 'u_buyer', legal_name: 'Buyer', email: 'b@e.com' },
    seller: { id: 'u_seller', legal_name: 'Seller', email: 's@e.com' }
  };

  // Force logged-in seller
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u_seller' } }));
  });

  // Stub APIs
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
    }
    return route.continue();
  });

  let events: any[] = [];
  await page.route(`**/api/shipments/${orderId}`, async (route) => {
    // Save & Mark Shipped
    currentOrder.state = 'shipped';
    currentOrder.updated_at = new Date().toISOString();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, shipment: { order_id: orderId, carrier: 'AUSPOST', tracking: 'T123' } }) });
  });
  await page.route(`**/api/shipments/${orderId}/events`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events }) });
    }
    if (req.method() === 'POST') {
      events = [{ id: 'e1', status: 'in_transit', event_time: new Date().toISOString() }];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, event: events[0] }) });
    }
    return route.continue();
  });

  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u_seller' });
  // Ensure client sees session too
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u_seller' } }));
  });
  await page.goto(`/orders/${orderId}`);
  await expect(page.locator('span.inline-block', { hasText: 'Payment Received' }).first()).toBeVisible();

  // Fill shipping form and mark shipped
  await page.getByPlaceholder('Carrier (e.g. AusPost)').first().fill('AUSPOST');
  await page.getByPlaceholder('Tracking number').first().fill('T123');
  await page.getByRole('button', { name: /Save & Mark Shipped/i }).click();
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: 'Shipped' }).first()).toBeVisible();

  // Add tracking event
  await page.getByPlaceholder('Status (e.g. in_transit)').fill('in_transit');
  await page.getByRole('button', { name: /Add Event/i }).click();
  await page.reload();
  await expect(page.getByText('in_transit')).toBeVisible();
});


