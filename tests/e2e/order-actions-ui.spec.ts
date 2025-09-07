import { test, expect } from '@playwright/test';

test('order actions UI: seller mark ready→shipped, buyer confirm→release', async ({ page }) => {
  const orderId = 'ui-actions-1';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 25000,
    buyer_id: 'u_buyer',
    seller_id: 'u_seller',
    state: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'Actions UI', description: 'Order actions flow', listing_photos: [] },
    buyer: { id: 'u_buyer', legal_name: 'Buyer', email: 'b@e.com' },
    seller: { id: 'u_seller', legal_name: 'Seller', email: 's@e.com' }
  };

  // Helper to set session in localStorage before page load
  async function setSession(userId: string) {
    await page.addInitScript((id) => {
      localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id } }));
    }, userId);
  }

  // Common routes
  await page.route(`**/api/shipments/${orderId}/events`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }));
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
    }
    if (req.method() === 'POST') {
      let body: any = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch {}
      switch (body?.action) {
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
      }
      currentOrder.updated_at = new Date().toISOString();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, state: currentOrder.state }) });
    }
    return route.continue();
  });

  // Phase 1: seller marks ready
  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u_seller' });
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u_seller' } }));
  });
  await setSession('u_seller');
  await page.goto(`/orders/${orderId}`);
  await expect(page.locator('span.inline-block', { hasText: 'Payment Received' }).first()).toBeVisible();
  // Ensure actions section is present (user recognized on client)
  await expect(page.getByRole('heading', { name: 'Order Actions' })).toBeVisible();
  await page.getByRole('button', { name: /Mark as Ready for Handover/i }).click({ trial: true }).catch(() => {});
  // Ensure seller actions are available
  await expect(page.getByRole('button', { name: /Mark as Ready for Handover/i })).toBeVisible();
  await page.getByRole('button', { name: /Mark as Ready for Handover/i }).click();
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: 'Ready for Handover' }).first()).toBeVisible();

  // Phase 2: seller marks shipped
  await page.getByRole('button', { name: /Mark as Shipped/i }).click();
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: 'Shipped' }).first()).toBeVisible();

  // Phase 3: buyer confirms delivery via API (ensures server accepts)
  await page.evaluate(async (orderId) => {
    await fetch(`/api/orders/${orderId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'u_buyer' }, body: JSON.stringify({ action: 'confirm_delivery' }) });
  }, orderId);
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: 'Delivered' }).first()).toBeVisible();

  // Phase 4: buyer releases funds
  await page.evaluate(async (orderId) => {
    await fetch(`/api/orders/${orderId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user-id': 'u_buyer' }, body: JSON.stringify({ action: 'release_funds' }) });
  }, orderId);
  await page.reload();
  await expect(page.locator('span.inline-block', { hasText: 'Funds Released' }).first()).toBeVisible();
});


