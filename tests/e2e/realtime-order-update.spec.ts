import { test, expect } from '@playwright/test';

test('realtime order update refreshes UI when channel event fires', async ({ page }) => {
  const orderId = 'rt-order-1';
  const currentOrder: any = {
    id: orderId,
    amount_cents: 1000,
    buyer_id: 'u_buyer',
    seller_id: 'u_seller',
    state: 'paid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    listings: { title: 'RT Order', description: 'Realtime test', listing_photos: [] },
    buyer: { id: 'u_buyer', legal_name: 'Buyer', email: 'b@e.com' },
    seller: { id: 'u_seller', legal_name: 'Seller', email: 's@e.com' }
  };

  // Stub initial fetch
  await page.route(`**/api/orders/${orderId}`, async (route) => {
    // Always return currentOrder snapshot
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentOrder) });
  });
  await page.route(`**/api/shipments/${orderId}/events`, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }));

  // Inject a test channel override that gives us a handle to trigger the callback
  await page.addInitScript(() => {
    (window as any).__TEST_CHANNEL_LISTENERS__ = {};
    (window as any).__TEST_OVERRIDE_SUPABASE_CHANNEL = (name: string) => {
      const listeners: any[] = [];
      return {
        on: (_evt: any, _filter: any, cb: any) => { listeners.push(cb); return { subscribe: () => ({ unsubscribe(){} }) } as any; },
        subscribe: () => ({ unsubscribe(){} }),
        __fire: () => { listeners.forEach(cb => cb({})); }
      } as any;
    };
  });

  await page.setExtraHTTPHeaders({ 'x-test-user-id': 'u_buyer' });
  await page.addInitScript(() => {
    localStorage.setItem('sb-session', JSON.stringify({ access_token: 't', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'u_buyer' } }));
  });
  await page.goto(`/orders/${orderId}`);
  await expect(page.getByRole('heading', { name: /Order #/ })).toBeVisible();
  await expect(page.locator('span.inline-block', { hasText: 'Payment Received' }).first()).toBeVisible();

  // Update in-memory order state to reflect delivery after realtime event
  currentOrder.state = 'delivered';

  // Allow subscribe to attach; verify latest channel is present
  await page.waitForFunction(() => Boolean((window as any).__LATEST_SUPABASE_CHANNEL__), undefined, { timeout: 2000 });
  await page.evaluate(() => {
    const ch = (window as any).__LATEST_SUPABASE_CHANNEL__;
    if (ch && ch.__fire) ch.__fire();
  });

  // Expect UI to reflect new state after handler refetches
  await expect(page.locator('span.inline-block', { hasText: 'Delivered' }).first()).toBeVisible();
});


