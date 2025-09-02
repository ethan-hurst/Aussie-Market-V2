import { test, expect } from '@playwright/test';

test('order actions UI: seller mark ready→shipped, buyer confirm→release', async ({ page }) => {
  const orderId = 'ui-actions-1';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 25000,
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
      const body = await req.postDataJSON().catch(() => ({}));
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
  await setSession('u_seller');
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText('Payment Received')).toBeVisible();
  await page.getByRole('button', { name: /Mark as Ready for Handover/i }).click();
  await page.reload();
  await expect(page.getByText('Ready for Handover')).toBeVisible();

  // Phase 2: seller marks shipped
  await page.getByRole('button', { name: /Mark as Shipped/i }).click();
  await page.reload();
  await expect(page.getByText('Shipped')).toBeVisible();

  // Phase 3: buyer confirms delivery
  await page.evaluate(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u_buyer' } }));
  });
  await page.reload();
  await page.getByRole('button', { name: /Confirm Delivery/i }).click();
  await page.reload();
  await expect(page.getByText('Delivered')).toBeVisible();

  // Phase 4: buyer releases funds
  await page.getByRole('button', { name: /Release Funds to Seller/i }).click();
  await page.reload();
  await expect(page.getByText('Funds Released')).toBeVisible();
});


